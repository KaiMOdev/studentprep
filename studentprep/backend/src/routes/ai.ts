import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { getSupabaseAdmin } from "../services/supabase.js";
import { extractTextFromPdf } from "../services/pdf-parser.js";
import {
  detectChapters,
  summarizeChapter,
  generateQuestions,
  translateText,
  generateStudyPlan,
  type UsageCallback,
} from "../services/ai-pipeline.js";
import { AI_MODELS, DEFAULT_MODEL, type AIModel, type ClaudeUsage } from "../services/claude.js";
import { getUserSubscription, canUseTokens, recordTokenUsage } from "../services/subscription.js";
import { getUserApiKey } from "../services/api-keys.js";
import type { AuthEnv } from "../types.js";

/** Helper: create a usage tracker that accumulates token counts and model info. */
function createUsageTracker() {
  let totalInput = 0;
  let totalOutput = 0;
  let lastModel: AIModel | undefined;
  const track: UsageCallback = (usage: ClaudeUsage) => {
    totalInput += usage.input_tokens;
    totalOutput += usage.output_tokens;
    lastModel = usage.model;
  };
  return {
    track,
    get inputTokens() { return totalInput; },
    get outputTokens() { return totalOutput; },
    get model() { return lastModel; },
  };
}

/** Helper: check token budget and return 403 if exceeded. */
async function checkTokenBudget(userId: string) {
  const sub = await getUserSubscription(userId);
  if (!(await canUseTokens(userId, sub.plan))) {
    return {
      error: "Monthly token limit reached. Upgrade to Pro for unlimited AI usage.",
      code: "UPGRADE_REQUIRED" as const,
      limit: "maxTokensPerMonth",
    };
  }
  return null;
}

/** Helper: resolve user's API key (returns undefined if none stored). */
async function resolveUserApiKey(userId: string): Promise<string | undefined> {
  try {
    const key = await getUserApiKey(userId);
    return key ?? undefined;
  } catch {
    return undefined;
  }
}

export const aiRoutes = new Hono<AuthEnv>();

// Track cancellable processing jobs
const cancelledCourses = new Set<string>();

// Track processing progress per course
interface ProcessingProgress {
  step: "extracting" | "detecting" | "saving_chapters" | "done";
  currentChapter: number;
  totalChapters: number;
  chapterTitle: string;
}
const processingProgress = new Map<string, ProcessingProgress>();

aiRoutes.use("*", requireAuth);

// List available AI models
aiRoutes.get("/models", (c) => {
  return c.json({ models: AI_MODELS, default: DEFAULT_MODEL });
});

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

// Validate and return a safe model id
function parseModel(raw: unknown): AIModel {
  if (typeof raw === "string" && AI_MODELS.some((m) => m.id === raw)) {
    return raw as AIModel;
  }
  return DEFAULT_MODEL;
}

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

  // Check token budget before making any changes
  const budgetError = await checkTokenBudget(userId);
  if (budgetError) return c.json(budgetError, 403);

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

  // Parse model from request body (JSON or empty)
  let model: AIModel = DEFAULT_MODEL;
  try {
    const body = await c.req.json();
    model = parseModel(body.model);
  } catch {
    // No body or invalid JSON — use default model
  }

  // Resolve user API key
  const userApiKey = await resolveUserApiKey(userId);

  // Run pipeline in background (don't block the response)
  processCourse(courseId, course.storage_path, model, userId, userApiKey).catch(async (err) => {
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

  return c.json({ message: "Processing started", courseId, model });
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

  // Check token budget
  const budgetError = await checkTokenBudget(userId);
  if (budgetError) return c.json(budgetError, 403);

  const userApiKey = await resolveUserApiKey(userId);
  const tracker = createUsageTracker();
  const questions = await generateQuestions(chapter.title, chapter.raw_text, undefined, DEFAULT_MODEL, tracker.track, userApiKey);

  // Record token usage with model info
  await recordTokenUsage(userId, tracker.inputTokens, tracker.outputTokens, "questions", tracker.model).catch(() => {});

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

  const { error: insertError } = await supabase
    .from("questions")
    .insert([...examRows, ...discussionRows]);

  if (insertError) {
    return c.json({ error: `Failed to save questions: ${insertError.message}` }, 500);
  }

  return c.json({ questions });
});

// Summarize a single chapter on demand
aiRoutes.post("/summarize-chapter/:chapterId", async (c) => {
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

  // Check if summary already exists
  if (chapter.summary_main && chapter.summary_main.length > 0) {
    return c.json({ message: "Summary already generated", summary_main: chapter.summary_main, summary_side: chapter.summary_side });
  }

  // Check token budget
  const budgetError = await checkTokenBudget(userId);
  if (budgetError) return c.json(budgetError, 403);

  // Parse model from request body
  let model: AIModel = DEFAULT_MODEL;
  try {
    const body = await c.req.json();
    model = parseModel(body.model);
  } catch {
    // No body or invalid JSON — use default model
  }

  const userApiKey = await resolveUserApiKey(userId);
  const tracker = createUsageTracker();
  const summary = await summarizeChapter(chapter.title, chapter.raw_text, model, tracker.track, userApiKey);

  // Record token usage with model info
  await recordTokenUsage(userId, tracker.inputTokens, tracker.outputTokens, "summarize-chapter", tracker.model).catch(() => {});

  // Update chapter with summary
  await supabase
    .from("chapters")
    .update({
      summary_main: summary.main_topics,
      summary_side: summary.side_topics,
    })
    .eq("id", chapterId);

  return c.json({ summary_main: summary.main_topics, summary_side: summary.side_topics });
});

// Translate a question or answer on demand (uses Sonnet 4.5 for speed)
aiRoutes.post("/translate", async (c) => {
  const userId = c.get("userId");
  const supabase = getSupabaseAdmin();

  const body = await c.req.json();
  const { questionId, field, targetLang } = body as {
    questionId: string;
    field: "question" | "answer";
    targetLang: "nl" | "fr" | "zh" | "hi" | "es" | "ar";
  };

  if (!questionId || !field || !targetLang) {
    return c.json({ error: "questionId, field, and targetLang are required" }, 400);
  }

  if (!["nl", "fr", "zh", "hi", "es", "ar"].includes(targetLang)) {
    return c.json({ error: "targetLang must be one of: nl, fr, zh, hi, es, ar" }, 400);
  }

  if (!["question", "answer"].includes(field)) {
    return c.json({ error: "field must be 'question' or 'answer'" }, 400);
  }

  // Fetch the question and verify ownership
  const { data: question } = await supabase
    .from("questions")
    .select("*, chapters!inner(courses!inner(user_id))")
    .eq("id", questionId)
    .single();

  if (!question || question.chapters.courses.user_id !== userId) {
    return c.json({ error: "Question not found" }, 404);
  }

  // Check if translation already exists in DB
  const translationsCol = field === "question" ? "question_translations" : "answer_translations";
  const existingTranslations = (question[translationsCol] || {}) as Record<string, string>;

  if (existingTranslations[targetLang]) {
    return c.json({ translation: existingTranslations[targetLang] });
  }

  // Check token budget
  const budgetError = await checkTokenBudget(userId);
  if (budgetError) return c.json(budgetError, 403);

  // Translate the source text
  const sourceText = field === "question" ? question.question : question.suggested_answer;
  const userApiKey = await resolveUserApiKey(userId);
  const tracker = createUsageTracker();
  const translation = await translateText(sourceText, targetLang, tracker.track, userApiKey);

  // Record token usage with model info
  await recordTokenUsage(userId, tracker.inputTokens, tracker.outputTokens, "translate", tracker.model).catch(() => {});

  // Save translation to DB for future requests
  const updatedTranslations = { ...existingTranslations, [targetLang]: translation };
  await supabase
    .from("questions")
    .update({ [translationsCol]: updatedTranslations })
    .eq("id", questionId);

  return c.json({ translation });
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

  // Check token budget
  const budgetError = await checkTokenBudget(userId);
  if (budgetError) return c.json(budgetError, 403);

  const userApiKey = await resolveUserApiKey(userId);
  const tracker = createUsageTracker();
  const plan = await generateStudyPlan(chapters, examDate, hoursPerDay, DEFAULT_MODEL, tracker.track, userApiKey);

  // Record token usage with model info
  await recordTokenUsage(userId, tracker.inputTokens, tracker.outputTokens, "study-plan", tracker.model).catch(() => {});

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
  storagePath: string,
  model: AIModel = DEFAULT_MODEL,
  userId?: string,
  userApiKey?: string
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

  const tracker = createUsageTracker();
  const chapters = await detectChapters(fullText, model, tracker.track, userApiKey);

  // Record token usage for chapter detection with model info
  if (userId) {
    await recordTokenUsage(userId, tracker.inputTokens, tracker.outputTokens, "summarize", tracker.model).catch(() => {});
  }

  // 4. Save chapters (summaries and questions are generated on-demand by the user)
  processingProgress.set(courseId, {
    step: "saving_chapters",
    currentChapter: 0,
    totalChapters: chapters.length,
    chapterTitle: "",
  });

  for (let i = 0; i < chapters.length; i++) {
    if (cancelledCourses.has(courseId)) {
      console.log(`Processing cancelled for course ${courseId}`);
      cancelledCourses.delete(courseId);
      processingProgress.delete(courseId);
      return;
    }

    const ch = chapters[i];

    processingProgress.set(courseId, {
      step: "saving_chapters",
      currentChapter: i + 1,
      totalChapters: chapters.length,
      chapterTitle: ch.title,
    });

    await supabase
      .from("chapters")
      .insert({
        course_id: courseId,
        title: ch.title,
        raw_text: ch.content,
        summary_main: null,
        summary_side: null,
        sort_order: i,
      });
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
