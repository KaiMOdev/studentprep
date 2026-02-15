import { apiFetch } from "./api";

export async function redirectToCheckout(): Promise<void> {
  const { url } = await apiFetch<{ url: string }>("/api/payments/checkout", {
    method: "POST",
  });
  window.location.href = url;
}

export async function redirectToPortal(): Promise<void> {
  const { url } = await apiFetch<{ url: string }>("/api/payments/portal", {
    method: "POST",
  });
  window.location.href = url;
}

export interface SubscriptionStatus {
  plan: "free" | "pro";
  status: "active" | "inactive" | "past_due" | "cancelled";
  currentPeriodEnd: string | null;
}

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  return apiFetch<SubscriptionStatus>("/api/payments/status");
}
