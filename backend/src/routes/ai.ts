import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { getSupabaseAdmin } from "../services/supabase.js";
import { extractTextFromPdf } from "../services/pdf-parser.js";
import {
  detectChapters,
  summarizeChapter,
  generateQuestions,
  generateStudyPlan,
} from "../services/ai-pipeline.js";
import type { AuthEnv } from "../types.js";

export const aiRoutes = new Hono<AuthEnv>();

aiRoutes.use("*", requireAuth);

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

  // Run pipeline in background (don't block the response)
  processCourse(courseId, course.storage_path).catch(async (err) => {
    console.error(`Processing failed for course ${courseId}:`, err);
    await supabase
      .from("courses")
      .update({ status: "error" })
      .eq("id", courseId);
  });

  return c.json({ message: "Processing started", courseId });
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

  const questions = await generateQuestions(chapter.title, chapter.raw_text);

  // Insert exam questions
  const examRows = questions.exam_questions.map((q) => ({
    chapter_id: chapterId,
    type: "exam",
    question: q.question,
    suggested_answer: q.suggested_answer,
  }));

  // Insert discussion questions
  const discussionRows = questions.discussion_questions.map((q) => ({
    chapter_id: chapterId,
    type: "discussion",
    question: q.question,
    suggested_answer: q.why_useful,
  }));

  await supabase.from("questions").insert([...examRows, ...discussionRows]);

  return c.json({ questions });
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

  // 1. Download PDF from storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("course-pdfs")
    .download(storagePath);

  if (downloadError || !fileData) {
    throw new Error(`Failed to download PDF: ${downloadError?.message}`);
  }

  // 2. Extract text
  const buffer = Buffer.from(await fileData.arrayBuffer());
  const fullText = await extractTextFromPdf(buffer);

  if (!fullText || fullText.trim().length < 50) {
    throw new Error("Could not extract enough text from PDF");
  }

  // 3. Detect chapters
  const chapters = await detectChapters(fullText);

  // 4. For each chapter: summarize + generate questions
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];

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

    // Generate questions
    const questions = await generateQuestions(ch.title, ch.content);

    const questionRows = [
      ...questions.exam_questions.map((q) => ({
        chapter_id: chapterRow.id,
        type: "exam" as const,
        question: q.question,
        suggested_answer: q.suggested_answer,
      })),
      ...questions.discussion_questions.map((q) => ({
        chapter_id: chapterRow.id,
        type: "discussion" as const,
        question: q.question,
        suggested_answer: q.why_useful,
      })),
    ];

    if (questionRows.length > 0) {
      await supabase.from("questions").insert(questionRows);
    }
  }

  // 5. Mark course as ready
  await supabase
    .from("courses")
    .update({ status: "ready" })
    .eq("id", courseId);
}
