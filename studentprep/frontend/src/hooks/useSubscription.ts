import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/api";

export interface SubscriptionStatus {
  plan: "free" | "pro";
  status: string;
  currentPeriodEnd: string | null;
  hasStripeCustomer: boolean;
  limits: {
    maxTokensPerMonth: number | null;
  };
  usage: {
    tokensThisMonth: number;
  };
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<SubscriptionStatus>("/api/payments/status");
      setSubscription(data);
    } catch {
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isPro = subscription?.plan === "pro";
  const isFree = !isPro;

  return { subscription, loading, refresh, isPro, isFree };
}
