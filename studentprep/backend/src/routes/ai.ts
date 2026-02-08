import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { getSupabaseAdmin } from "../services/supabase.js";
import { extractTextFromPdf } from "../services/pdf-parser.js";
import {
  detectChapters,
  summarizeChapter,
  generateQuestions,
  generateMultilingualQuestions,
  generateStudyPlan,
} from "../services/ai-pipeline.js";
import type { AuthEnv } from "../types.js";

export const aiRoutes = new Hono<AuthEnv>();

// Track cancellable processing jobs
const cancelledCourses = new Set<string>();

// Track processing progress per course
interface ProcessingProgress {
  step: "extracting" | "detecting" | "processing_chapter" | "done";
  currentChapter: number;
  totalChapters: number;
  chapterTitle: string;
}
const processingProgress = new Map<string, ProcessingProgress>();

aiRoutes.use("*", requireAuth);

// Get processing progress for a course
aiRoutes.get("/progress/:courseId", async (c) => {
  const userId = c.get("userId");
  const courseId = c.req.param("courseId");
  const supabase = getSupabaseAdmin();

  // Verify ownership
  const { data: course } = await supabase
    .from("courses")
    .select("id, status")
    .eq("id", courseId)
    .eq("user_id", userId)
    .single();

  if (!course) {
    return c.json({ error: "Course not found" }, 404);
  }

  const progress = processingProgress.get(courseId);
  if (!progress) {
    return c.json({ step: "unknown", currentChapter: 0, totalChapters: 0, chapterTitle: "" });
  }

  return c.json(progress);
});

// Process a course: extract text → detect chapters → summarize → generate questions
aiRoutes.post("/summarize/:courseId", async (c) => {
  const userId = c.get("userId");
  const courseId = c.req.param("courseId");
  const supabase = getSupabaseAdmin();

  // Verify ownership
  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .eq("user_id", userId)
    .single();

  if (!course) {
    return c.json({ error: "Course not found" }, 404);
  }

  if (course.status === "processing") {
    return c.json({ error: "Course is already being processed" }, 409);
  }

  // Clear old chapters/questions if retrying
  const { data: oldChapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("course_id", courseId);
  if (oldChapters && oldChapters.length > 0) {
    const oldIds = oldChapters.map((ch: any) => ch.id);
    await supabase.from("questions").delete().in("chapter_id", oldIds);
    await supabase.from("chapters").delete().eq("course_id", courseId);
  }

  // Mark as processing
  await supabase
    .from("courses")
    .update({ status: "processing" })
    .eq("id", courseId);

  // Clear any stale cancellation flag
  cancelledCourses.delete(courseId);

  // Run pipeline in background (don't block the response)
  processCourse(courseId, course.storage_path).catch(async (err) => {
    processingProgress.delete(courseId);

    // Don't set error status if it was a cancellation
    if (cancelledCourses.has(courseId)) {
      cancelledCourses.delete(courseId);
      return;
    }

    const isAuthError =
      err instanceof Error &&
      err.message.includes("authentication failed");

    if (isAuthError) {
      console.error(
        `Processing failed for course ${courseId}: Anthropic API authentication failed — check ANTHROPIC_API_KEY in .env`
      );
    } else {
      console.error(`Processing failed for course ${courseId}:`, err);
    }

    await supabase
      .from("courses")
      .update({ status: "error" })
      .eq("id", courseId);
  });

  return c.json({ message: "Processing started", courseId });
});

// Cancel processing
aiRoutes.post("/cancel/:courseId", async (c) => {
  const userId = c.get("userId");
  const courseId = c.req.param("courseId");
  const supabase = getSupabaseAdmin();

  // Verify ownership
  const { data: course } = await supabase
    .from("courses")
    .select("id, status")
    .eq("id", courseId)
    .eq("user_id", userId)
    .single();

  if (!course) {
    return c.json({ error: "Course not found" }, 404);
  }

  if (course.status !== "processing") {
    return c.json({ error: "Course is not being processed" }, 400);
  }

  // Signal cancellation
  cancelledCourses.add(courseId);
  processingProgress.delete(courseId);

  // Reset status to uploaded
  await supabase
    .from("courses")
    .update({ status: "uploaded" })
    .eq("id", courseId);

  // Clean up any partially created chapters/questions
  const { data: partialChapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("course_id", courseId);
  if (partialChapters && partialChapters.length > 0) {
    const ids = partialChapters.map((ch: any) => ch.id);
    await supabase.from("questions").delete().in("chapter_id", ids);
    await supabase.from("chapters").delete().eq("course_id", courseId);
  }

  return c.json({ message: "Processing cancelled" });
});

// Generate questions for a specific chapter
aiRoutes.post("/questions/:chapterId", async (c) => {
  const userId = c.get("userId");
  const chapterId = c.req.param("chapterId");
  const supabase = getSupabaseAdmin();

  // Verify ownership through chapter → course → user
  const { data: chapter } = await supabase
    .from("chapters")
    .select("*, courses!inner(user_id)")
    .eq("id", chapterId)
    .single();

  if (!chapter || chapter.courses.user_id !== userId) {
    return c.json({ error: "Chapter not found" }, 404);
  }

  // Check if questions already exist
  const { data: existing } = await supabase
    .from("questions")
    .select("id")
    .eq("chapter_id", chapterId)
    .limit(1);

  if (existing && existing.length > 0) {
    return c.json({ message: "Questions already generated" });
  }

  const questions = await generateMultilingualQuestions(chapter.title, chapter.raw_text);

  // Insert exam questions
  const examRows = questions.exam_questions.map((q) => ({
    chapter_id: chapterId,
    type: "exam",
    question: q.question.en,
    suggested_answer: q.suggested_answer.en,
    question_translations: { nl: q.question.nl, fr: q.question.fr },
    answer_translations: { nl: q.suggested_answer.nl, fr: q.suggested_answer.fr },
  }));

  // Insert discussion questions
  const discussionRows = questions.discussion_questions.map((q) => ({
    chapter_id: chapterId,
    type: "discussion",
    question: q.question.en,
    suggested_answer: q.why_useful.en,
    question_translations: { nl: q.question.nl, fr: q.question.fr },
    answer_translations: { nl: q.why_useful.nl, fr: q.why_useful.fr },
  }));

  await supabase.from("questions").insert([...examRows, ...discussionRows]);

  return c.json({ questions });
});

// Get existing study plans for a course
aiRoutes.get("/study-plans/:courseId", async (c) => {
  const userId = c.get("userId");
  const courseId = c.req.param("courseId");
  const supabase = getSupabaseAdmin();

  const { data: plans } = await supabase
    .from("study_plans")
    .select("*")
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return c.json({ plans: plans || [] });
});

// Delete a study plan
aiRoutes.delete("/study-plan/:planId", async (c) => {
  const userId = c.get("userId");
  const planId = c.req.param("planId");
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("study_plans")
    .delete()
    .eq("id", planId)
    .eq("user_id", userId);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ message: "Plan deleted" });
});

// Generate study plan
aiRoutes.post("/study-plan", async (c) => {
  const userId = c.get("userId");
  const supabase = getSupabaseAdmin();

  const body = await c.req.json();
  const { courseId, examDate, hoursPerDay } = body;

  if (!courseId || !examDate || !hoursPerDay) {
    return c.json({ error: "courseId, examDate, and hoursPerDay are required" }, 400);
  }

  // Verify ownership
  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("user_id", userId)
    .single();

  if (!course) {
    return c.json({ error: "Course not found" }, 404);
  }

  // Get chapters
  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title")
    .eq("course_id", courseId)
    .order("sort_order");

  if (!chapters || chapters.length === 0) {
    return c.json({ error: "Course has no chapters. Process it first." }, 400);
  }

  const plan = await generateStudyPlan(chapters, examDate, hoursPerDay);

  // Save plan
  const { data: savedPlan, error: insertError } = await supabase
    .from("study_plans")
    .insert({
      user_id: userId,
      course_id: courseId,
      exam_date: examDate,
      plan,
    })
    .select()
    .single();

  if (insertError) {
    return c.json({ error: insertError.message }, 500);
  }

  return c.json({ plan: savedPlan }, 201);
});

// ---- Background processing pipeline ----

async function processCourse(
  courseId: string,
  storagePath: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Track progress
  processingProgress.set(courseId, {
    step: "extracting",
    currentChapter: 0,
    totalChapters: 0,
    chapterTitle: "",
  });

  // 1. Download PDF from storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("course-pdfs")
    .download(storagePath);

  if (downloadError || !fileData) {
    processingProgress.delete(courseId);
    throw new Error(`Failed to download PDF: ${downloadError?.message}`);
  }

  // 2. Extract text
  const buffer = Buffer.from(await fileData.arrayBuffer());
  const fullText = await extractTextFromPdf(buffer);

  if (!fullText || fullText.trim().length < 50) {
    processingProgress.delete(courseId);
    throw new Error("Could not extract enough text from PDF");
  }

  // 3. Detect chapters
  processingProgress.set(courseId, {
    step: "detecting",
    currentChapter: 0,
    totalChapters: 0,
    chapterTitle: "",
  });

  const chapters = await detectChapters(fullText);

  // 4. For each chapter: summarize + generate questions
  for (let i = 0; i < chapters.length; i++) {
    // Check for cancellation between chapters
    if (cancelledCourses.has(courseId)) {
      console.log(`Processing cancelled for course ${courseId}`);
      cancelledCourses.delete(courseId);
      processingProgress.delete(courseId);
      return;
    }

    const ch = chapters[i];

    processingProgress.set(courseId, {
      step: "processing_chapter",
      currentChapter: i + 1,
      totalChapters: chapters.length,
      chapterTitle: ch.title,
    });

    // Summarize
    const summary = await summarizeChapter(ch.title, ch.content);

    // Insert chapter
    const { data: chapterRow } = await supabase
      .from("chapters")
      .insert({
        course_id: courseId,
        title: ch.title,
        raw_text: ch.content,
        summary_main: summary.main_topics,
        summary_side: summary.side_topics,
        sort_order: i,
      })
      .select("id")
      .single();

    if (!chapterRow) continue;

    // Generate multilingual questions (EN, NL, FR)
    const questions = await generateMultilingualQuestions(ch.title, ch.content);

    const questionRows = [
      ...questions.exam_questions.map((q) => ({
        chapter_id: chapterRow.id,
        type: "exam" as const,
        question: q.question.en,
        suggested_answer: q.suggested_answer.en,
        question_translations: { nl: q.question.nl, fr: q.question.fr },
        answer_translations: { nl: q.suggested_answer.nl, fr: q.suggested_answer.fr },
      })),
      ...questions.discussion_questions.map((q) => ({
        chapter_id: chapterRow.id,
        type: "discussion" as const,
        question: q.question.en,
        suggested_answer: q.why_useful.en,
        question_translations: { nl: q.question.nl, fr: q.question.fr },
        answer_translations: { nl: q.why_useful.nl, fr: q.why_useful.fr },
      })),
    ];

    if (questionRows.length > 0) {
      await supabase.from("questions").insert(questionRows);
    }
  }

  // 5. Mark course as ready
  processingProgress.set(courseId, {
    step: "done",
    currentChapter: chapters.length,
    totalChapters: chapters.length,
    chapterTitle: "",
  });

  await supabase
    .from("courses")
    .update({ status: "ready" })
    .eq("id", courseId);

  // Clean up progress after a short delay so frontend can see "done"
  setTimeout(() => processingProgress.delete(courseId), 10000);
}
