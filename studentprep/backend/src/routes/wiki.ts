import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { getSupabaseAdmin } from "../services/supabase.js";
import { lookupWikipedia } from "../services/wikipedia.js";
import type { AuthEnv } from "../types.js";

export const wikiRoutes = new Hono<AuthEnv>();

// All routes require authentication
wikiRoutes.use("*", requireAuth);

// Lookup a topic on Wikipedia for a given chapter
// GET /api/chapters/:id/wiki/:topic
wikiRoutes.get("/:id/wiki/:topic", async (c) => {
  const userId = c.get("userId");
  const chapterId = c.req.param("id");
  const topic = decodeURIComponent(c.req.param("topic"));

  const supabase = getSupabaseAdmin();

  // Verify the chapter belongs to the user
  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, course_id")
    .eq("id", chapterId)
    .single();

  if (!chapter) {
    return c.json({ error: "Chapter not found" }, 404);
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("id", chapter.course_id)
    .eq("user_id", userId)
    .single();

  if (!course) {
    return c.json({ error: "Not authorized" }, 403);
  }

  const result = await lookupWikipedia(topic);

  if (!result) {
    return c.json({ error: "No Wikipedia article found for this topic" }, 404);
  }

  return c.json(result);
});
