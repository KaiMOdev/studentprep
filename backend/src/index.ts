import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { courseRoutes } from "./routes/courses.js";
import { aiRoutes } from "./routes/ai.js";
import { quizRoutes } from "./routes/quiz.js";
import { paymentRoutes } from "./routes/payments.js";
import { pdfRoutes } from "./routes/pdf.js";

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

// Health check (no auth required)
app.get("/health", (c) => c.json({ status: "ok" }));

// API routes
app.route("/api/courses", courseRoutes);
app.route("/api/ai", aiRoutes);
app.route("/api/quiz", quizRoutes);
app.route("/api/payments", paymentRoutes);
app.route("/api/pdf", pdfRoutes);

// Start server
const port = parseInt(process.env.PORT || "8080");
console.log(`StudyFlow API running on port ${port}`);

serve({ fetch: app.fetch, port });
