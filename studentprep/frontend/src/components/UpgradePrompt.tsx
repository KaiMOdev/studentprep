interface UpgradePromptProps {
  title?: string;
  description: string;
  compact?: boolean;
}

export function UpgradePrompt({ title = "Upgrade to Pro", description, compact }: UpgradePromptProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200 animate-fade-in-up">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
          <svg className="h-4 w-4 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-800">{description}</p>
        </div>
        <ProBadge />
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-8 text-center ring-1 ring-amber-200 animate-fade-in-up">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100">
        <svg className="h-8 w-8 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
        </svg>
      </div>
      <h3 className="text-lg font-bold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm text-gray-600">{description}</p>
      <a
        href="/pricing"
        className="mt-4 inline-block rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:from-amber-600 hover:to-orange-600 transition"
      >
        Upgrade to Pro
      </a>
    </div>
  );
}

export function ProBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2 py-0.5 text-xs font-bold text-white">
      PRO
    </span>
  );
}

export function PlanBadge({ plan }: { plan: "free" | "pro" }) {
  if (plan === "pro") {
    return <ProBadge />;
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
      FREE
    </span>
  );
}

interface TokenUsageMeterProps {
  used: number;
  max: number | null;
}

export function TokenUsageMeter({ used, max }: TokenUsageMeterProps) {
  if (max === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span>{used.toLocaleString()} tokens used</span>
        <span className="text-gray-300">&#183;</span>
        <span>Unlimited</span>
      </div>
    );
  }

  const pct = Math.min((used / max) * 100, 100);
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-indigo-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">
          {used.toLocaleString()} / {max.toLocaleString()} tokens
        </span>
        <span className={`font-medium ${pct >= 90 ? "text-red-600" : pct >= 70 ? "text-amber-600" : "text-gray-500"}`}>
          {Math.round(pct)}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
