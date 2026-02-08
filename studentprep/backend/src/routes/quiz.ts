import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { getSupabaseAdmin } from "../services/supabase.js";
import type { AuthEnv } from "../types.js";

export const quizRoutes = new Hono<AuthEnv>();

quizRoutes.use("*", requireAuth);

// Generate a quiz: mix of new + review questions (spaced repetition)
quizRoutes.post("/generate", async (c) => {
  const userId = c.get("userId");
  const supabase = getSupabaseAdmin();

  const body = await c.req.json();
  const { chapterIds, courseId } = body;

  if (!chapterIds?.length || !courseId) {
    return c.json({ error: "chapterIds and courseId are required" }, 400);
  }

  const { data: courseChapters, error: courseChaptersError } = await supabase
    .from("chapters")
    .select("id")
    .eq("course_id", courseId);

  if (courseChaptersError) {
    return c.json({ error: courseChaptersError.message }, 500);
  }

  const courseChapterIds = new Set(
    (courseChapters || []).map((chapter: { id: string }) => chapter.id)
  );

  // Get questions for selected chapters (new material)
  const { data: newQuestions } = await supabase
    .from("questions")
    .select("id, chapter_id, type, question, suggested_answer")
    .in("chapter_id", chapterIds)
    .eq("type", "exam");

  // Get questions from previously studied chapters (spaced repetition)
  // Find chapters the user has been quizzed on before
  const { data: pastResults } = await supabase
    .from("quiz_results")
    .select("questions")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  // Collect chapter IDs from past quizzes
  const pastChapterIds = new Set<string>();
  for (const result of pastResults || []) {
    for (const q of result.questions as any[]) {
      if (
        q.from_chapter &&
        courseChapterIds.has(q.from_chapter) &&
        !chapterIds.includes(q.from_chapter)
      ) {
        pastChapterIds.add(q.from_chapter);
      }
    }
  }

  let reviewQuestions: any[] = [];
  if (pastChapterIds.size > 0) {
    const { data } = await supabase
      .from("questions")
      .select("id, chapter_id, type, question, suggested_answer")
      .in("chapter_id", Array.from(pastChapterIds))
      .eq("type", "exam");
    reviewQuestions = data || [];
  }

  // Mix: 60% new, 40% review
  const shuffled = (arr: any[]) => arr.sort(() => Math.random() - 0.5);
  const newPool = shuffled(newQuestions || []);
  const reviewPool = shuffled(reviewQuestions);

  const maxNew = Math.min(newPool.length, 6);
  const maxReview = Math.min(reviewPool.length, 4);

  const quizQuestions = [
    ...newPool.slice(0, maxNew).map((q: any) => ({ ...q, is_review: false })),
    ...reviewPool.slice(0, maxReview).map((q: any) => ({ ...q, is_review: true })),
  ];

  // Shuffle the final mix
  shuffled(quizQuestions);

  // Create a study session record
  const { data: session } = await supabase
    .from("study_sessions")
    .insert({
      user_id: userId,
      chapters_covered: chapterIds,
    })
    .select("id")
    .single();

  return c.json({
    session_id: session?.id,
    questions: quizQuestions,
    includes_review: maxReview > 0,
  });
});

// Submit quiz answers and get score
quizRoutes.post("/submit", async (c) => {
  const userId = c.get("userId");
  const supabase = getSupabaseAdmin();

  const body = await c.req.json();
  const { sessionId, answers } = body;

  if (!answers?.length) {
    return c.json({ error: "answers are required" }, 400);
  }

  // answers: [{question_id, chapter_id, user_answer, is_review}]
  // Simple scoring: mark each as answered (we can't auto-grade open questions,
  // so we store them and let the user self-assess)
  const totalQuestions = answers.length;
  const correctCount = answers.filter((a: any) => a.self_correct).length;
  const score = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

  const questionsJson = answers.map((a: any) => ({
    question_id: a.question_id,
    from_chapter: a.chapter_id,
    user_answer: a.user_answer,
    self_correct: a.self_correct,
    is_review: a.is_review || false,
  }));

  const { data: result, error } = await supabase
    .from("quiz_results")
    .insert({
      user_id: userId,
      session_id: sessionId || null,
      questions: questionsJson,
      score,
      includes_review: answers.some((a: any) => a.is_review),
    })
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ result, score });
});

// Get quiz history for a course
quizRoutes.get("/history/:courseId", async (c) => {
  const userId = c.get("userId");
  const courseId = c.req.param("courseId");
  const supabase = getSupabaseAdmin();

  // Get all sessions for this course's chapters
  const { data: chapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("course_id", courseId);

  if (!chapters?.length) {
    return c.json({ history: [] });
  }

  const { data: results } = await supabase
    .from("quiz_results")
    .select("id, score, includes_review, created_at, questions")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  return c.json({ history: results || [] });
});
