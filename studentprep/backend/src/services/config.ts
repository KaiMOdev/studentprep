// Centralized environment configuration & validation.
// Call validateConfig() at startup to log what's missing.

export interface ConfigStatus {
  supabase: boolean;
  anthropic: boolean;
  stripe: boolean;
  ready: boolean; // true when the minimum required vars are present
  missing: string[];
}

export function validateConfig(): ConfigStatus {
  const missing: string[] = [];

  const supabase =
    Boolean(process.env.SUPABASE_URL) &&
    Boolean(process.env.SUPABASE_SERVICE_KEY);

  const anthropic = Boolean(process.env.ANTHROPIC_API_KEY);

  const stripe =
    Boolean(process.env.STRIPE_SECRET_KEY) &&
    Boolean(process.env.STRIPE_WEBHOOK_SECRET) &&
    Boolean(process.env.STRIPE_PRO_PRICE_ID);

  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_KEY) missing.push("SUPABASE_SERVICE_KEY");
  if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
  if (!process.env.STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY");
  if (!process.env.STRIPE_WEBHOOK_SECRET) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!process.env.STRIPE_PRO_PRICE_ID) missing.push("STRIPE_PRO_PRICE_ID");

  // Minimum requirement: Supabase must be configured for the API to function
  const ready = supabase;

  return { supabase, anthropic, stripe, ready, missing };
}

export function logConfigStatus(status: ConfigStatus): void {
  console.log("");
  console.log("=== Configuration Status ===");
  console.log(`  Supabase : ${status.supabase ? "OK" : "MISSING"}`);
  console.log(`  Anthropic: ${status.anthropic ? "OK" : "MISSING"}`);
  console.log(`  Stripe   : ${status.stripe ? "OK" : "MISSING (optional)"}`);

  if (status.missing.length > 0) {
    console.log("");
    console.log("  Missing environment variables:");
    for (const v of status.missing) {
      console.log(`    - ${v}`);
    }
  }

  if (!status.ready) {
    console.log("");
    console.log(
      "  ⚠ API is NOT ready — Supabase credentials are required."
    );
    console.log(
      "  Copy studentprep/backend/.env.example to studentprep/backend/.env and fill in your values."
    );
  }

  console.log("============================");
  console.log("");
}
