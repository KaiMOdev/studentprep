import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useSubscriptionContext } from "../contexts/SubscriptionContext";

const FEATURES_FREE = [
  "1 course",
  "Basic summaries (main topics only)",
  "3 exam questions per chapter",
  "5 Wikipedia lookups / day",
  "50K AI tokens / month",
];

const FEATURES_PRO = [
  "Unlimited courses",
  "Full summaries (main + side topics)",
  "5 exam + 5 discussion questions per chapter",
  "Study planning with spaced repetition",
  "Mini exams & quizzes",
  "Highlighted PDF export",
  "Unlimited Wikipedia lookups",
  "Unlimited AI tokens",
];

export default function Pricing() {
  const navigate = useNavigate();
  const { subscription, isPro } = useSubscriptionContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCheckout = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ url: string }>("/api/payments/checkout", {
        method: "POST",
      });
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
    } finally {
      setLoading(false);
    }
  };

  const handleManage = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ url: string }>("/api/payments/portal", {
        method: "POST",
      });
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open portal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <header className="glass-header sticky top-0 z-30 border-b border-gray-200/60 px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-xl font-extrabold tracking-tight text-indigo-600"
          >
            StudyFlow
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="btn-press rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            Back to Dashboard
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
            Choose your plan
          </h1>
          <p className="mt-3 text-gray-500">
            Unlock the full power of AI-assisted studying
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200 animate-fade-in-up mx-auto max-w-md">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Free Tier */}
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
            <div className="mb-6">
              <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
                FREE
              </span>
              <div className="mt-4">
                <span className="text-4xl font-extrabold text-gray-900">$0</span>
                <span className="text-gray-500 ml-1">/month</span>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Get started with basic features
              </p>
            </div>

            <ul className="space-y-3 mb-8">
              {FEATURES_FREE.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-gray-600">
                  <svg className="h-5 w-5 shrink-0 text-gray-400 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              disabled
              className="w-full rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-500 cursor-default"
            >
              {subscription?.plan === "free" ? "Current plan" : "Free tier"}
            </button>
          </div>

          {/* Pro Tier */}
          <div className="relative rounded-2xl bg-white p-8 shadow-lg ring-2 ring-indigo-500">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-1 text-xs font-bold text-white shadow-sm">
                RECOMMENDED
              </span>
            </div>

            <div className="mb-6">
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1 text-xs font-bold text-white">
                PRO
              </span>
              <div className="mt-4">
                <span className="text-4xl font-extrabold text-gray-900">$9.99</span>
                <span className="text-gray-500 ml-1">/month</span>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Everything you need to ace your exams
              </p>
            </div>

            <ul className="space-y-3 mb-8">
              {FEATURES_PRO.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                  <svg className="h-5 w-5 shrink-0 text-indigo-500 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            {isPro ? (
              <button
                onClick={handleManage}
                disabled={loading}
                className="btn-press w-full rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition disabled:opacity-50"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
                    Opening portal...
                  </span>
                ) : (
                  "Manage subscription"
                )}
              </button>
            ) : (
              <button
                onClick={handleCheckout}
                disabled={loading}
                className="btn-press w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:from-indigo-700 hover:to-purple-700 transition disabled:opacity-50"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Redirecting to checkout...
                  </span>
                ) : (
                  "Upgrade to Pro"
                )}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
