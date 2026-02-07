import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import type { AuthEnv } from "../types.js";

export const quizRoutes = new Hono<AuthEnv>();

quizRoutes.use("*", requireAuth);

// Placeholder — will be implemented in Phase 3
quizRoutes.post("/generate", async (c) => {
  return c.json({ message: "Quiz generation — coming in Phase 3" }, 501);
});

quizRoutes.post("/submit", async (c) => {
  return c.json({ message: "Quiz submission — coming in Phase 3" }, 501);
});
