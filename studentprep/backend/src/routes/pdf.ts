import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import type { AuthEnv } from "../types.js";
import { getSupabaseAdmin } from "../services/supabase.js";
import {
  generateHighlightedPdf,
  type ChapterPdfData,
} from "../services/pdf-generator.js";

export const pdfRoutes = new Hono<AuthEnv>();

pdfRoutes.use("*", requireAuth);

pdfRoutes.post("/highlighted/:courseId", async (c) => {
  const courseId = c.req.param("courseId");
  const userId = c.get("userId");
  const supabase = getSupabaseAdmin();

  // Fetch course (verify ownership)
  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id, title, status, user_id")
    .eq("id", courseId)
    .single();

  if (courseErr || !course) {
    return c.json({ error: "Course not found" }, 404);
  }

  if (course.user_id !== userId) {
    return c.json({ error: "Not authorized" }, 403);
  }

  if (course.status !== "ready") {
    return c.json(
      { error: "Course has not been processed yet. Run AI summarization first." },
      400
    );
  }

  // Fetch chapters with summaries
  const { data: chapters, error: chapErr } = await supabase
    .from("chapters")
    .select("title, sort_order, summary_main, summary_side")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });

  if (chapErr || !chapters || chapters.length === 0) {
    return c.json({ error: "No chapters found for this course" }, 404);
  }

  // Generate PDF
  const pdfBuffer = await generateHighlightedPdf(
    course.title,
    chapters as ChapterPdfData[]
  );

  // Return as downloadable PDF
  const filename = `${course.title.replace(/[^a-zA-Z0-9 ]/g, "").trim()}_StudyFlow.pdf`;

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": pdfBuffer.length.toString(),
    },
  });
});
