import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { getSupabaseAdmin } from "../services/supabase.js";
import type { AuthEnv } from "../types.js";

export const courseRoutes = new Hono<AuthEnv>();

// All routes require authentication
courseRoutes.use("*", requireAuth);

// List user's courses
courseRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("courses")
    .select("id, title, original_filename, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ courses: data });
});

// Get single course with chapters
courseRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const courseId = c.req.param("id");
  const supabase = getSupabaseAdmin();

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .eq("user_id", userId)
    .single();

  if (courseError || !course) {
    return c.json({ error: "Course not found" }, 404);
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, summary_main, summary_side, sort_order")
    .eq("course_id", courseId)
    .order("sort_order");

  // Fetch questions for all chapters
  const chapterIds = (chapters || []).map((ch: any) => ch.id);
  let questions: any[] = [];
  if (chapterIds.length > 0) {
    const { data } = await supabase
      .from("questions")
      .select("id, chapter_id, type, question, suggested_answer")
      .in("chapter_id", chapterIds);
    questions = data || [];
  }

  return c.json({ course, chapters: chapters || [], questions });
});

// Upload course PDF
courseRoutes.post("/upload", async (c) => {
  const userId = c.get("userId");
  const supabase = getSupabaseAdmin();

  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file || file.type !== "application/pdf") {
    return c.json({ error: "Please upload a PDF file" }, 400);
  }

  const filename = file.name;
  const storagePath = `${userId}/${Date.now()}-${filename}`;

  // Upload to Supabase Storage
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("course-pdfs")
    .upload(storagePath, buffer, { contentType: "application/pdf" });

  if (uploadError) {
    return c.json({ error: "Failed to upload file" }, 500);
  }

  // Create course record
  const { data: course, error: insertError } = await supabase
    .from("courses")
    .insert({
      user_id: userId,
      title: filename.replace(/\.pdf$/i, ""),
      original_filename: filename,
      storage_path: storagePath,
      status: "uploaded",
    })
    .select()
    .single();

  if (insertError) {
    return c.json({ error: insertError.message }, 500);
  }

  return c.json({ course }, 201);
});

// Delete course
courseRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const courseId = c.req.param("id");
  const supabase = getSupabaseAdmin();

  // Check ownership first
  const { data: course } = await supabase
    .from("courses")
    .select("storage_path")
    .eq("id", courseId)
    .eq("user_id", userId)
    .single();

  if (!course) {
    return c.json({ error: "Course not found" }, 404);
  }

  // Delete file from storage
  if (course.storage_path) {
    await supabase.storage.from("course-pdfs").remove([course.storage_path]);
  }

  // Delete course (cascades to chapters, questions)
  await supabase.from("courses").delete().eq("id", courseId);

  return c.json({ success: true });
});
