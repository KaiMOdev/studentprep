import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import type { AuthEnv } from "../types.js";

export const aiRoutes = new Hono<AuthEnv>();

aiRoutes.use("*", requireAuth);

// Placeholder — will be implemented in Phase 2
aiRoutes.post("/summarize/:courseId", async (c) => {
  return c.json({ message: "AI summarization — coming in Phase 2" }, 501);
});

aiRoutes.post("/questions/:chapterId", async (c) => {
  return c.json({ message: "Question generation — coming in Phase 2" }, 501);
});

aiRoutes.post("/study-plan", async (c) => {
  return c.json({ message: "Study plan generation — coming in Phase 3" }, 501);
});
