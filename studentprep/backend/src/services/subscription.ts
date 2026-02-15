import { getSupabaseAdmin } from "./supabase.js";
import { getLimits, type PlanTier } from "../config/tierLimits.js";

export interface UserSubscription {
  plan: PlanTier;
  status: string;
}

/**
 * Look up the user's subscription. If no record exists, they are on the free plan.
 */
export async function getUserSubscription(userId: string): Promise<UserSubscription> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .single();

  if (!data || data.status !== "active" || data.plan !== "pro") {
    return { plan: "free", status: data?.status || "inactive" };
  }
  return { plan: "pro", status: "active" };
}

/**
 * Get the user's total token usage for the current calendar month.
 */
export async function getMonthlyTokenUsage(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data } = await supabase
    .from("token_usage")
    .select("total_tokens")
    .eq("user_id", userId)
    .eq("period_year", year)
    .eq("period_month", month);

  if (!data) return 0;
  return data.reduce((sum: number, row: any) => sum + (row.total_tokens || 0), 0);
}

/**
 * Record a token usage entry for the current month.
 */
export async function recordTokenUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  endpoint: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  await supabase.from("token_usage").insert({
    user_id: userId,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    endpoint,
    period_year: now.getFullYear(),
    period_month: now.getMonth() + 1,
  });
}

/**
 * Check if the user can still make AI calls (has token budget remaining).
 */
export async function canUseTokens(userId: string, plan: PlanTier): Promise<boolean> {
  const limits = getLimits(plan);
  if (limits.maxTokensPerMonth === Infinity) return true;
  const used = await getMonthlyTokenUsage(userId);
  return used < limits.maxTokensPerMonth;
}
