import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { getUserSubscription, getMonthlyTokenUsage } from "../services/subscription.js";
import { getLimits } from "../config/tierLimits.js";
import type { AuthEnv } from "../types.js";

export const paymentRoutes = new Hono<AuthEnv>();

// Stripe webhook does NOT require auth (Stripe calls it directly)
paymentRoutes.post("/webhook", async (c) => {
  // TODO Phase 4: verify Stripe signature, process subscription events
  return c.json({ received: true });
});

// These routes require auth
paymentRoutes.use("/checkout", requireAuth);
paymentRoutes.use("/status", requireAuth);

paymentRoutes.post("/checkout", async (c) => {
  return c.json({ message: "Stripe checkout — coming in Phase 4" }, 501);
});

paymentRoutes.get("/status", async (c) => {
  const userId = c.get("userId");
  const sub = await getUserSubscription(userId);
  const limits = getLimits(sub.plan);
  const tokenUsage = await getMonthlyTokenUsage(userId);

  return c.json({
    plan: sub.plan,
    status: sub.status,
    limits: {
      maxTokensPerMonth: limits.maxTokensPerMonth === Infinity ? null : limits.maxTokensPerMonth,
    },
    usage: {
      tokensThisMonth: tokenUsage,
    },
  });
});
