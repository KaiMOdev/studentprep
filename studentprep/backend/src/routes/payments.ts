import { Hono } from "hono";
import Stripe from "stripe";
import { requireAuth } from "../middleware/auth.js";
import { getUserSubscription, getMonthlyTokenUsage } from "../services/subscription.js";
import { getLimits } from "../config/tierLimits.js";
import { getSupabaseAdmin } from "../services/supabase.js";
import type { AuthEnv } from "../types.js";

export const paymentRoutes = new Hono<AuthEnv>();

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion });
}

const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || "";

/**
 * Find or create a Stripe customer for the given user.
 */
async function getOrCreateStripeCustomer(
  stripe: Stripe,
  userId: string,
  email: string
): Promise<string> {
  const supabase = getSupabaseAdmin();

  // Check if user already has a Stripe customer ID in our DB
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .single();

  if (sub?.stripe_customer_id) {
    return sub.stripe_customer_id;
  }

  // Create a new Stripe customer
  const customer = await stripe.customers.create({
    email,
    metadata: { supabase_user_id: userId },
  });

  // Upsert subscription record with the new customer ID
  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customer.id,
      plan: "free",
      status: "inactive",
    },
    { onConflict: "user_id" }
  );

  return customer.id;
}

// ─── Stripe Webhook (no auth — Stripe calls this directly) ───────────────

paymentRoutes.post("/webhook", async (c) => {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return c.json({ error: "Webhook secret not configured" }, 500);
  }

  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  let event: Stripe.Event;
  try {
    const rawBody = await c.req.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return c.json({ error: `Webhook Error: ${message}` }, 400);
  }

  const supabase = getSupabaseAdmin();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      if (customerId && subscriptionId) {
        // Retrieve the subscription to get period end
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        await supabase
          .from("subscriptions")
          .update({
            stripe_subscription_id: subscriptionId,
            plan: "pro",
            status: "active",
            current_period_end: new Date(
              subscription.current_period_end * 1000
            ).toISOString(),
          })
          .eq("stripe_customer_id", customerId);

        console.log(`Subscription activated for customer ${customerId}`);
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id;

      if (customerId) {
        const status = subscription.status;
        const plan =
          status === "active" || status === "trialing" ? "pro" : "free";

        await supabase
          .from("subscriptions")
          .update({
            plan,
            status:
              status === "active"
                ? "active"
                : status === "past_due"
                  ? "past_due"
                  : status === "canceled"
                    ? "cancelled"
                    : "inactive",
            current_period_end: new Date(
              subscription.current_period_end * 1000
            ).toISOString(),
          })
          .eq("stripe_customer_id", customerId);

        console.log(
          `Subscription updated for customer ${customerId}: ${status}`
        );
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id;

      if (customerId) {
        await supabase
          .from("subscriptions")
          .update({
            plan: "free",
            status: "cancelled",
            stripe_subscription_id: null,
            current_period_end: null,
          })
          .eq("stripe_customer_id", customerId);

        console.log(`Subscription cancelled for customer ${customerId}`);
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id;

      if (customerId) {
        await supabase
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_customer_id", customerId);

        console.log(`Payment failed for customer ${customerId}`);
      }
      break;
    }

    default:
      // Unhandled event type — log and acknowledge
      console.log(`Unhandled Stripe event: ${event.type}`);
  }

  return c.json({ received: true });
});

// ─── Authenticated routes ────────────────────────────────────────────────

paymentRoutes.use("/checkout", requireAuth);
paymentRoutes.use("/status", requireAuth);
paymentRoutes.use("/portal", requireAuth);

// Create Stripe Checkout session for Pro subscription
paymentRoutes.post("/checkout", async (c) => {
  const stripe = getStripe();
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");

  if (!PRO_PRICE_ID) {
    return c.json(
      {
        error:
          "Stripe is not fully configured. STRIPE_PRO_PRICE_ID is missing.",
      },
      503
    );
  }

  const customerId = await getOrCreateStripeCustomer(
    stripe,
    userId,
    userEmail
  );

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
    success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl}/pricing`,
    subscription_data: {
      metadata: { supabase_user_id: userId },
    },
  });

  return c.json({ url: session.url });
});

// Get current subscription status
paymentRoutes.get("/status", async (c) => {
  const userId = c.get("userId");
  const sub = await getUserSubscription(userId);
  const limits = getLimits(sub.plan);
  const tokenUsage = await getMonthlyTokenUsage(userId);

  // Also get current_period_end for display
  const supabase = getSupabaseAdmin();
  const { data: subRecord } = await supabase
    .from("subscriptions")
    .select("current_period_end, stripe_customer_id")
    .eq("user_id", userId)
    .single();

  return c.json({
    plan: sub.plan,
    status: sub.status,
    currentPeriodEnd: subRecord?.current_period_end || null,
    hasStripeCustomer: Boolean(subRecord?.stripe_customer_id),
    limits: {
      maxTokensPerMonth:
        limits.maxTokensPerMonth === Infinity
          ? null
          : limits.maxTokensPerMonth,
    },
    usage: {
      tokensThisMonth: tokenUsage,
    },
  });
});

// Create Stripe Customer Portal session for managing subscription
paymentRoutes.post("/portal", async (c) => {
  const stripe = getStripe();
  const userId = c.get("userId");

  const supabase = getSupabaseAdmin();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .single();

  if (!sub?.stripe_customer_id) {
    return c.json({ error: "No active subscription found" }, 404);
  }

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${frontendUrl}/dashboard`,
  });

  return c.json({ url: session.url });
});
