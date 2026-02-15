import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";

interface PlatformStats {
  totalUsers: number;
  totalCourses: number;
  totalQuizzes: number;
  totalStudyPlans: number;
  coursesByStatus: {
    uploaded: number;
    processing: number;
    ready: number;
    error: number;
  };
}

interface UserEntry {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  courses: number;
  quizzes: number;
  subscription: { plan: string; status: string };
  role: string;
}

interface ConfigStatus {
  supabase: boolean;
  anthropic: boolean;
  stripe: boolean;
  ready: boolean;
  missing: string[];
  adminEmails: number;
}

interface UserCostEntry {
  userId: string;
  email: string;
  year: number;
  month: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  hasApiKey: boolean;
  byModel: Record<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }
  >;
}

interface CostOverview {
  year: number;
  month: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  users: UserCostEntry[];
}

type Tab = "overview" | "users" | "costs" | "system";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MODEL_LABELS: Record<string, string> = {
  "claude-sonnet-4-5-20250929": "Sonnet 4.5",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  unknown: "Unknown",
};

function formatCost(usd: number): string {
  if (usd < 0.01 && usd > 0) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export default function AdminSettings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [costData, setCostData] = useState<CostOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);

  // Cost tab: month/year navigation
  const now = new Date();
  const [costYear, setCostYear] = useState(now.getFullYear());
  const [costMonth, setCostMonth] = useState(now.getMonth() + 1);
  const [costLoading, setCostLoading] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch<{ stats: PlatformStats }>("/api/admin/stats");
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiFetch<{ users: UserEntry[] }>("/api/admin/users");
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const data = await apiFetch<{ config: ConfigStatus }>("/api/admin/config");
      setConfig(data.config);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    }
  }, []);

  const loadCosts = useCallback(
    async (year: number, month: number) => {
      setCostLoading(true);
      try {
        const data = await apiFetch<CostOverview>(
          `/api/admin/costs?year=${year}&month=${month}`
        );
        setCostData(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load cost data"
        );
      } finally {
        setCostLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([loadStats(), loadUsers(), loadConfig()]).finally(() =>
      setLoading(false)
    );
  }, [loadStats, loadUsers, loadConfig]);

  // Load costs when tab switches to costs or month changes
  useEffect(() => {
    if (activeTab === "costs") {
      loadCosts(costYear, costMonth);
    }
  }, [activeTab, costYear, costMonth, loadCosts]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingUser(userId);
    try {
      await apiFetch(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setUpdatingUser(null);
    }
  };

  const handlePlanChange = async (userId: string, newPlan: string) => {
    setUpdatingUser(userId);
    try {
      await apiFetch(`/api/admin/users/${userId}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan }),
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                subscription: {
                  plan: newPlan,
                  status: newPlan === "pro" ? "active" : "inactive",
                },
              }
            : u
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update plan");
    } finally {
      setUpdatingUser(null);
    }
  };

  const goToPrevMonth = () => {
    if (costMonth === 1) {
      setCostMonth(12);
      setCostYear(costYear - 1);
    } else {
      setCostMonth(costMonth - 1);
    }
  };

  const goToNextMonth = () => {
    const isCurrentMonth =
      costYear === now.getFullYear() && costMonth === now.getMonth() + 1;
    if (isCurrentMonth) return;
    if (costMonth === 12) {
      setCostMonth(1);
      setCostYear(costYear + 1);
    } else {
      setCostMonth(costMonth + 1);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "users", label: "Users" },
    { key: "costs", label: "Costs" },
    { key: "system", label: "System" },
  ];

  const isCurrentMonth =
    costYear === now.getFullYear() && costMonth === now.getMonth() + 1;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/dashboard")}
              className="text-xl font-bold text-indigo-600 hover:text-indigo-700"
            >
              StudyFlow
            </button>
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user?.email}</span>
            <button
              onClick={() => navigate("/dashboard")}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Dashboard
            </button>
            <button
              onClick={signOut}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <h2 className="mb-6 text-2xl font-semibold">Admin Settings</h2>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.key
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button
              onClick={() => setError("")}
              className="ml-2 font-medium underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === "overview" && stats && (
              <div className="space-y-6">
                {/* Stats cards */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <StatCard label="Total Users" value={stats.totalUsers} />
                  <StatCard label="Total Courses" value={stats.totalCourses} />
                  <StatCard label="Quizzes Taken" value={stats.totalQuizzes} />
                  <StatCard
                    label="Study Plans"
                    value={stats.totalStudyPlans}
                  />
                </div>

                {/* Course status breakdown */}
                <div className="rounded-lg bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-lg font-medium">
                    Courses by Status
                  </h3>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <StatusCard
                      label="Uploaded"
                      value={stats.coursesByStatus.uploaded}
                      color="bg-yellow-100 text-yellow-800"
                    />
                    <StatusCard
                      label="Processing"
                      value={stats.coursesByStatus.processing}
                      color="bg-blue-100 text-blue-800"
                    />
                    <StatusCard
                      label="Ready"
                      value={stats.coursesByStatus.ready}
                      color="bg-green-100 text-green-800"
                    />
                    <StatusCard
                      label="Error"
                      value={stats.coursesByStatus.error}
                      color="bg-red-100 text-red-800"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Users Tab */}
            {activeTab === "users" && (
              <div className="rounded-lg bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="px-4 py-3 font-medium text-gray-700">
                          Email
                        </th>
                        <th className="px-4 py-3 font-medium text-gray-700">
                          Joined
                        </th>
                        <th className="px-4 py-3 font-medium text-gray-700">
                          Courses
                        </th>
                        <th className="px-4 py-3 font-medium text-gray-700">
                          Quizzes
                        </th>
                        <th className="px-4 py-3 font-medium text-gray-700">
                          Plan
                        </th>
                        <th className="px-4 py-3 font-medium text-gray-700">
                          Role
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b last:border-b-0">
                          <td className="px-4 py-3">
                            <div className="font-medium">{u.email}</div>
                            <div className="text-xs text-gray-400">
                              {u.id.slice(0, 8)}...
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {new Date(u.created_at).toLocaleDateString("en-GB")}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {u.courses}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {u.quizzes}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={u.subscription.plan}
                              onChange={(e) =>
                                handlePlanChange(u.id, e.target.value)
                              }
                              disabled={updatingUser === u.id}
                              className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                            >
                              <option value="free">Free</option>
                              <option value="pro">Pro</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={u.role}
                              onChange={(e) =>
                                handleRoleChange(u.id, e.target.value)
                              }
                              disabled={updatingUser === u.id}
                              className="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-8 text-center text-gray-500"
                          >
                            No users found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Costs Tab */}
            {activeTab === "costs" && (
              <div className="space-y-6">
                {/* Month navigation */}
                <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm">
                  <button
                    onClick={goToPrevMonth}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {MONTH_NAMES[costMonth - 1]} {costYear}
                  </h3>
                  <button
                    onClick={goToNextMonth}
                    disabled={isCurrentMonth}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>

                {costLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                  </div>
                ) : costData ? (
                  <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div className="rounded-lg bg-white p-4 shadow-sm">
                        <p className="text-sm text-gray-500">Total Cost</p>
                        <p className="mt-1 text-2xl font-bold text-red-600">
                          {formatCost(costData.totalCostUsd)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white p-4 shadow-sm">
                        <p className="text-sm text-gray-500">Active Users</p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">
                          {costData.users.length}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white p-4 shadow-sm">
                        <p className="text-sm text-gray-500">Input Tokens</p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">
                          {formatTokens(costData.totalInputTokens)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white p-4 shadow-sm">
                        <p className="text-sm text-gray-500">Output Tokens</p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">
                          {formatTokens(costData.totalOutputTokens)}
                        </p>
                      </div>
                    </div>

                    {/* Pricing reference */}
                    <div className="rounded-lg bg-indigo-50 p-4">
                      <h4 className="mb-2 text-sm font-medium text-indigo-800">
                        Anthropic API Pricing (per million tokens)
                      </h4>
                      <div className="grid grid-cols-2 gap-4 text-xs text-indigo-700 sm:grid-cols-3">
                        <div>
                          <span className="font-medium">Sonnet 4.5:</span>{" "}
                          $3/MTok input, $15/MTok output
                        </div>
                        <div>
                          <span className="font-medium">Haiku 4.5:</span>{" "}
                          $1/MTok input, $5/MTok output
                        </div>
                      </div>
                    </div>

                    {/* Per-user cost table */}
                    <div className="rounded-lg bg-white shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              <th className="px-4 py-3 font-medium text-gray-700">
                                User
                              </th>
                              <th className="px-4 py-3 text-right font-medium text-gray-700">
                                Input Tokens
                              </th>
                              <th className="px-4 py-3 text-right font-medium text-gray-700">
                                Output Tokens
                              </th>
                              <th className="px-4 py-3 text-right font-medium text-gray-700">
                                Est. Cost
                              </th>
                              <th className="px-4 py-3 text-center font-medium text-gray-700">
                                Own Key
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {costData.users.map((u) => (
                              <UserCostRow
                                key={u.userId}
                                user={u}
                                isExpanded={expandedUser === u.userId}
                                onToggle={() =>
                                  setExpandedUser(
                                    expandedUser === u.userId
                                      ? null
                                      : u.userId
                                  )
                                }
                              />
                            ))}
                            {costData.users.length === 0 && (
                              <tr>
                                <td
                                  colSpan={5}
                                  className="px-4 py-8 text-center text-gray-500"
                                >
                                  No usage data for this month
                                </td>
                              </tr>
                            )}
                          </tbody>
                          {costData.users.length > 0 && (
                            <tfoot>
                              <tr className="border-t-2 bg-gray-50 font-medium">
                                <td className="px-4 py-3 text-gray-900">
                                  Total
                                </td>
                                <td className="px-4 py-3 text-right text-gray-900">
                                  {formatTokens(costData.totalInputTokens)}
                                </td>
                                <td className="px-4 py-3 text-right text-gray-900">
                                  {formatTokens(costData.totalOutputTokens)}
                                </td>
                                <td className="px-4 py-3 text-right font-bold text-red-600">
                                  {formatCost(costData.totalCostUsd)}
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            )}

            {/* System Tab */}
            {activeTab === "system" && config && (
              <div className="space-y-6">
                <div className="rounded-lg bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-lg font-medium">
                    Service Configuration
                  </h3>
                  <div className="space-y-3">
                    <ServiceRow
                      name="Supabase"
                      connected={config.supabase}
                      required
                    />
                    <ServiceRow
                      name="Anthropic (AI)"
                      connected={config.anthropic}
                      required
                    />
                    <ServiceRow
                      name="Stripe (Payments)"
                      connected={config.stripe}
                    />
                  </div>
                </div>

                {config.missing.length > 0 && (
                  <div className="rounded-lg bg-yellow-50 p-6">
                    <h3 className="mb-2 text-sm font-medium text-yellow-800">
                      Missing Environment Variables
                    </h3>
                    <ul className="list-inside list-disc text-sm text-yellow-700">
                      {config.missing.map((v) => (
                        <li key={v} className="font-mono">
                          {v}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-lg bg-white p-6 shadow-sm">
                  <h3 className="mb-2 text-lg font-medium">Admin Access</h3>
                  <p className="text-sm text-gray-600">
                    {config.adminEmails} email(s) configured via{" "}
                    <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                      ADMIN_EMAILS
                    </code>{" "}
                    environment variable.
                  </p>
                  <p className="mt-2 text-xs text-gray-400">
                    Add comma-separated emails to the ADMIN_EMAILS env var or
                    promote users to admin from the Users tab.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function StatusCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="text-center">
      <span
        className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${color}`}
      >
        {label}
      </span>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}

function ServiceRow({
  name,
  connected,
  required,
}: {
  name: string;
  connected: boolean;
  required?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-green-500" : "bg-red-400"}`}
        />
        <span className="text-sm font-medium">{name}</span>
        {required && (
          <span className="text-xs text-gray-400">required</span>
        )}
      </div>
      <span
        className={`text-xs font-medium ${connected ? "text-green-600" : "text-red-500"}`}
      >
        {connected ? "Connected" : "Not configured"}
      </span>
    </div>
  );
}

function UserCostRow({
  user,
  isExpanded,
  onToggle,
}: {
  user: UserCostEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const modelEntries = Object.entries(user.byModel);

  return (
    <>
      <tr
        className="cursor-pointer border-b hover:bg-gray-50 last:border-b-0"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block text-xs transition-transform ${isExpanded ? "rotate-90" : ""}`}
            >
              &#9654;
            </span>
            <div>
              <div className="font-medium">{user.email}</div>
              <div className="text-xs text-gray-400">
                {user.userId.slice(0, 8)}...
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-gray-600">
          {formatTokens(user.inputTokens)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-gray-600">
          {formatTokens(user.outputTokens)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
          {formatCost(user.estimatedCostUsd)}
        </td>
        <td className="px-4 py-3 text-center">
          {user.hasApiKey ? (
            <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              Yes
            </span>
          ) : (
            <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              No
            </span>
          )}
        </td>
      </tr>
      {isExpanded && modelEntries.length > 0 && (
        <tr className="border-b bg-gray-50/50">
          <td colSpan={5} className="px-4 py-3">
            <div className="ml-6 space-y-1">
              <p className="mb-2 text-xs font-medium text-gray-500">
                Cost by model:
              </p>
              {modelEntries.map(([model, data]) => (
                <div
                  key={model}
                  className="flex items-center justify-between text-xs text-gray-600"
                >
                  <span className="font-medium">
                    {MODEL_LABELS[model] || model}
                  </span>
                  <span className="flex gap-4">
                    <span>
                      {formatTokens(data.inputTokens)} in /{" "}
                      {formatTokens(data.outputTokens)} out
                    </span>
                    <span className="w-16 text-right font-medium text-gray-900">
                      {formatCost(data.costUsd)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
