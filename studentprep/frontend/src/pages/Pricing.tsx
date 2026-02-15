import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  redirectToCheckout,
  redirectToPortal,
  getSubscriptionStatus,
  type SubscriptionStatus,
} from "../lib/stripe";

export default function Pricing() {
  const navigate = useNavigate();
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getSubscriptionStatus()
      .then(setSub)
      .catch(() => setSub({ plan: "free", status: "inactive", currentPeriodEnd: null }))
      .finally(() => setLoading(false));
  }, []);

  const isPro = sub?.plan === "pro" && sub?.status === "active";

  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    setError("");
    try {
      await redirectToCheckout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setCheckoutLoading(false);
    }
  };

  const handleManage = async () => {
    setCheckoutLoading(true);
    setError("");
    try {
      await redirectToPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setCheckoutLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50/50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      <header className="glass-header sticky top-0 z-30 border-b border-gray-200/60 px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-xl font-extrabold tracking-tight text-indigo-600">StudyFlow</h1>
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
          <h2 className="text-3xl font-extrabold tracking-tight">Choose your plan</h2>
          <p className="mt-2 text-gray-500">Unlock the full power of AI-assisted studying.</p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200 text-center">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Free tier */}
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100">
            <h3 className="text-lg font-bold text-gray-900">Free</h3>
            <p className="mt-1 text-sm text-gray-500">Get started with the basics</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold">$0</span>
              <span className="text-gray-400">/month</span>
            </div>
            <ul className="mt-6 space-y-3 text-sm text-gray-600">
              <Feature text="1 course" />
              <Feature text="Basic summaries (main topics)" />
              <Feature text="3 exam questions per chapter" />
              <Feature text="5 Wikipedia lookups/day" />
            </ul>
            {!isPro && (
              <div className="mt-8 rounded-xl bg-gray-100 px-4 py-3 text-center text-sm font-semibold text-gray-500">
                Current plan
              </div>
            )}
          </div>

          {/* Pro tier */}
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-2 ring-indigo-500 relative">
            <div className="absolute -top-3 left-6 rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold text-white">
              RECOMMENDED
            </div>
            <h3 className="text-lg font-bold text-gray-900">Pro</h3>
            <p className="mt-1 text-sm text-gray-500">Everything you need for exam success</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold">$9.99</span>
              <span className="text-gray-400">/month</span>
            </div>
            <ul className="mt-6 space-y-3 text-sm text-gray-600">
              <Feature text="Unlimited courses" highlight />
              <Feature text="Full summaries (main + side topics)" highlight />
              <Feature text="5 + 5 questions per chapter" highlight />
              <Feature text="Study planning & scheduling" highlight />
              <Feature text="Mini exams with spaced repetition" highlight />
              <Feature text="Highlighted PDF export" highlight />
              <Feature text="Unlimited Wikipedia lookups" highlight />
            </ul>
            {isPro ? (
              <button
                onClick={handleManage}
                disabled={checkoutLoading}
                className="btn-press mt-8 w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
              >
                {checkoutLoading ? "Redirecting..." : "Manage subscription"}
              </button>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={checkoutLoading}
                className="btn-press mt-8 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 shadow-sm shadow-indigo-200"
              >
                {checkoutLoading ? "Redirecting..." : "Upgrade to Pro"}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Feature({ text, highlight }: { text: string; highlight?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <svg
        className={`h-4 w-4 shrink-0 ${highlight ? "text-indigo-500" : "text-gray-400"}`}
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      {text}
    </li>
  );
}
