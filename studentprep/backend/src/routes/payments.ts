import { Hono } from "hono";
import Stripe from "stripe";
import { requireAuth } from "../middleware/auth.js";
import { getSupabaseAdmin } from "../services/supabase.js";
import type { AuthEnv } from "../types.js";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key);
}

export const paymentRoutes = new Hono<AuthEnv>();

// ─── Webhook (no auth — Stripe calls this directly) ─────────────────────────
paymentRoutes.post("/webhook", async (c) => {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return c.json({ error: "Invalid signature" }, 400);
  }

  const supabase = getSupabaseAdmin();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;

      if (!userId) {
        console.error("checkout.session.completed: missing userId in metadata");
        break;
      }

      // Fetch the subscription to get the current period end
      const sub = await stripe.subscriptions.retrieve(subscriptionId);

      await supabase.from("subscriptions").upsert(
        {
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: "active",
          plan: "pro",
          current_period_end: new Date(
            sub.current_period_end * 1000
          ).toISOString(),
        },
        { onConflict: "user_id" }
      );

      console.log(`Subscription activated for user ${userId}`);
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;

      const stripeStatus = sub.status; // active, past_due, canceled, etc.
      let dbStatus: string;
      if (stripeStatus === "active" || stripeStatus === "trialing") {
        dbStatus = "active";
      } else if (stripeStatus === "past_due") {
        dbStatus = "past_due";
      } else {
        dbStatus = "cancelled";
      }

      await supabase
        .from("subscriptions")
        .update({
          status: dbStatus,
          plan: dbStatus === "active" ? "pro" : "free",
          current_period_end: new Date(
            sub.current_period_end * 1000
          ).toISOString(),
        })
        .eq("stripe_customer_id", customerId);

      console.log(`Subscription updated for customer ${customerId}: ${dbStatus}`);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;

      await supabase
        .from("subscriptions")
        .update({
          status: "cancelled",
          plan: "free",
        })
        .eq("stripe_customer_id", customerId);

      console.log(`Subscription cancelled for customer ${customerId}`);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return c.json({ received: true });
});

// ─── Protected routes ────────────────────────────────────────────────────────
paymentRoutes.use("/checkout", requireAuth);
paymentRoutes.use("/status", requireAuth);
paymentRoutes.use("/portal", requireAuth);

// POST /api/payments/checkout — Create a Stripe Checkout session
paymentRoutes.post("/checkout", async (c) => {
  const stripe = getStripe();
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return c.json({ error: "STRIPE_PRICE_ID is not configured" }, 500);
  }

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  const supabase = getSupabaseAdmin();

  // Check if user already has a Stripe customer ID
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .single();

  let customerId = existing?.stripe_customer_id;

  // Create a new Stripe customer if needed
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: { userId },
    });
    customerId = customer.id;

    // Insert a subscription record with the customer ID (still inactive)
    await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        status: "inactive",
        plan: "free",
      },
      { onConflict: "user_id" }
    );
  }

  // Create Checkout Session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${frontendUrl}/dashboard?checkout=success`,
    cancel_url: `${frontendUrl}/dashboard?checkout=cancelled`,
    metadata: { userId },
  });

  return c.json({ url: session.url });
});

// GET /api/payments/status — Get the current user's subscription status
paymentRoutes.get("/status", async (c) => {
  const userId = c.get("userId");
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("subscriptions")
    .select("plan, status, current_period_end")
    .eq("user_id", userId)
    .single();

  if (!data) {
    return c.json({ plan: "free", status: "inactive", currentPeriodEnd: null });
  }

  return c.json({
    plan: data.plan,
    status: data.status,
    currentPeriodEnd: data.current_period_end,
  });
});

// POST /api/payments/portal — Create a Stripe Customer Portal session (manage subscription)
paymentRoutes.post("/portal", async (c) => {
  const stripe = getStripe();
  const userId = c.get("userId");
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .single();

  if (!data?.stripe_customer_id) {
    return c.json({ error: "No active subscription found" }, 404);
  }

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  const session = await stripe.billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${frontendUrl}/dashboard`,
  });

  return c.json({ url: session.url });
});
