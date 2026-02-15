import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { courseRoutes } from "./routes/courses.js";
import { aiRoutes } from "./routes/ai.js";
import { quizRoutes } from "./routes/quiz.js";
import { paymentRoutes } from "./routes/payments.js";
import { pdfRoutes } from "./routes/pdf.js";
import { wikiRoutes } from "./routes/wiki.js";
import { adminRoutes, authMeRoutes, apiKeyRoutes } from "./routes/admin.js";
import { validateConfig, logConfigStatus } from "./services/config.js";
import { isAnthropicConfigured } from "./services/claude.js";

// Validate configuration at startup
const configStatus = validateConfig();

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowed = (process.env.FRONTEND_URL || "http://localhost:5173").split(",");
      return allowed.includes(origin) ? origin : allowed[0];
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Health check (no auth required) — includes config status for diagnostics
app.get("/health", (c) =>
  c.json({
    status: configStatus.ready ? "ok" : "misconfigured",
    services: {
      supabase: configStatus.supabase,
      anthropic: configStatus.anthropic,
      stripe: configStatus.stripe,
    },
    ...(configStatus.ready
      ? {}
      : { hint: "Copy .env.example to .env and set SUPABASE_URL + SUPABASE_SERVICE_KEY" }),
  })
);

// Guard: return 503 on all /api/* routes when Supabase is not configured
app.use("/api/*", async (c, next) => {
  if (!configStatus.ready) {
    return c.json(
      {
        error: "Server is not configured. Supabase credentials are missing.",
        missing: configStatus.missing.filter((v) =>
          ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"].includes(v)
        ),
        hint: "Copy studentprep/backend/.env.example to studentprep/backend/.env and fill in your Supabase project values.",
      },
      503
    );
  }
  await next();
});

// Guard: return 503 on AI routes when Anthropic API key is not configured
app.use("/api/ai/*", async (c, next) => {
  if (!isAnthropicConfigured()) {
    return c.json(
      {
        error:
          "AI features are unavailable — ANTHROPIC_API_KEY is not configured.",
        hint: "Set ANTHROPIC_API_KEY in studentprep/backend/.env and restart the server.",
      },
      503
    );
  }
  await next();
});

// API routes
app.route("/api/courses", courseRoutes);
app.route("/api/ai", aiRoutes);
app.route("/api/quiz", quizRoutes);
app.route("/api/payments", paymentRoutes);
app.route("/api/pdf", pdfRoutes);
app.route("/api/chapters", wikiRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/api-keys", apiKeyRoutes);
app.route("/api/auth", authMeRoutes);

// Start server
const port = parseInt(process.env.PORT || "8080");

logConfigStatus(configStatus);
console.log(`StudyFlow API running on port ${port}`);

serve({ fetch: app.fetch, port });
