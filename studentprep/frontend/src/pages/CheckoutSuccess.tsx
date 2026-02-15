import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscriptionContext } from "../contexts/SubscriptionContext";

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const { refresh } = useSubscriptionContext();
  const [refreshed, setRefreshed] = useState(false);

  useEffect(() => {
    // Refresh subscription status after successful checkout
    refresh().then(() => setRefreshed(true));
  }, [refresh]);

  return (
    <div className="min-h-screen bg-gray-50/50 flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-2xl bg-white p-8 text-center shadow-lg ring-1 ring-gray-100 animate-fade-in-up">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-green-50">
          <svg className="h-10 w-10 text-green-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>

        <h1 className="text-2xl font-extrabold text-gray-900">
          Welcome to Pro!
        </h1>
        <p className="mt-3 text-gray-500">
          Your subscription is now active. You have access to all Pro features
          including unlimited courses, full summaries, study planning, and more.
        </p>

        {!refreshed && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
            Updating your account...
          </div>
        )}

        <button
          onClick={() => navigate("/dashboard")}
          className="btn-press mt-6 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
