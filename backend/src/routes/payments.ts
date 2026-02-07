import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
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
  return c.json({ plan: "free", status: "active" });
});
