import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import type { AuthEnv } from "../types.js";

export const pdfRoutes = new Hono<AuthEnv>();

pdfRoutes.use("*", requireAuth);

// Placeholder — will be implemented in Phase 4
pdfRoutes.post("/highlighted/:courseId", async (c) => {
  return c.json({ message: "PDF generation — coming in Phase 4" }, 501);
});
