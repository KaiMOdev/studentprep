import { getSupabaseAdmin } from "./supabase.js";
import { getLimits, type PlanTier } from "../config/tierLimits.js";
import type { AIModel } from "./claude.js";

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
 * Record a token usage entry for the current month, including model info.
 */
export async function recordTokenUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  endpoint: string,
  model?: AIModel
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  await supabase.from("token_usage").insert({
    user_id: userId,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    endpoint,
    model: model || null,
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

// ─── Cost Calculation ────────────────────────────────────────────────────────

/**
 * Pricing per million tokens (from Anthropic pricing page).
 * Based on the image provided:
 * - Claude Sonnet 4.5: $3/MTok input, $15/MTok output
 * - Claude Haiku 4.5: $1/MTok input, $5/MTok output
 */
const MODEL_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  "claude-sonnet-4-5-20250929": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
};

const DEFAULT_PRICING = { inputPerMTok: 3, outputPerMTok: 15 };

export function calculateCost(inputTokens: number, outputTokens: number, model?: string): number {
  const pricing = model && MODEL_PRICING[model] ? MODEL_PRICING[model] : DEFAULT_PRICING;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMTok;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMTok;
  return inputCost + outputCost;
}

export interface UserMonthlyCost {
  userId: string;
  email?: string;
  year: number;
  month: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  byModel: Record<string, {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>;
}

/**
 * Get monthly cost breakdown for all users (for admin panel).
 */
export async function getAllUsersMonthlyCosts(year: number, month: number): Promise<UserMonthlyCost[]> {
  const supabase = getSupabaseAdmin();

  const { data: usageRows } = await supabase
    .from("token_usage")
    .select("user_id, input_tokens, output_tokens, model")
    .eq("period_year", year)
    .eq("period_month", month);

  if (!usageRows || usageRows.length === 0) return [];

  // Aggregate by user and model
  const userMap = new Map<string, UserMonthlyCost>();

  for (const row of usageRows) {
    const uid = row.user_id;
    if (!userMap.has(uid)) {
      userMap.set(uid, {
        userId: uid,
        year,
        month,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        byModel: {},
      });
    }
    const entry = userMap.get(uid)!;
    const inputTok = row.input_tokens || 0;
    const outputTok = row.output_tokens || 0;
    const modelName = row.model || "unknown";

    entry.inputTokens += inputTok;
    entry.outputTokens += outputTok;
    entry.totalTokens += inputTok + outputTok;

    if (!entry.byModel[modelName]) {
      entry.byModel[modelName] = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    }
    entry.byModel[modelName].inputTokens += inputTok;
    entry.byModel[modelName].outputTokens += outputTok;
    entry.byModel[modelName].costUsd += calculateCost(inputTok, outputTok, modelName);
    entry.estimatedCostUsd += calculateCost(inputTok, outputTok, modelName);
  }

  return Array.from(userMap.values()).sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);
}

/**
 * Get monthly cost for a single user.
 */
export async function getUserMonthlyCost(userId: string, year: number, month: number): Promise<UserMonthlyCost> {
  const supabase = getSupabaseAdmin();

  const { data: usageRows } = await supabase
    .from("token_usage")
    .select("input_tokens, output_tokens, model")
    .eq("user_id", userId)
    .eq("period_year", year)
    .eq("period_month", month);

  const result: UserMonthlyCost = {
    userId,
    year,
    month,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    byModel: {},
  };

  if (!usageRows) return result;

  for (const row of usageRows) {
    const inputTok = row.input_tokens || 0;
    const outputTok = row.output_tokens || 0;
    const modelName = row.model || "unknown";

    result.inputTokens += inputTok;
    result.outputTokens += outputTok;
    result.totalTokens += inputTok + outputTok;

    if (!result.byModel[modelName]) {
      result.byModel[modelName] = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    }
    result.byModel[modelName].inputTokens += inputTok;
    result.byModel[modelName].outputTokens += outputTok;
    result.byModel[modelName].costUsd += calculateCost(inputTok, outputTok, modelName);
    result.estimatedCostUsd += calculateCost(inputTok, outputTok, modelName);
  }

  return result;
}
