export const TIER_LIMITS = {
  free: {
    maxTokensPerMonth: 50_000,
  },
  pro: {
    maxTokensPerMonth: Infinity,
  },
} as const;

export type PlanTier = keyof typeof TIER_LIMITS;

export function getLimits(plan: PlanTier) {
  return TIER_LIMITS[plan];
}
