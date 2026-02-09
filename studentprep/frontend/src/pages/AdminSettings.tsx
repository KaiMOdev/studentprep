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

type Tab = "overview" | "users" | "system";

export default function AdminSettings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);

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

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([loadStats(), loadUsers(), loadConfig()]).finally(() =>
      setLoading(false)
    );
  }, [loadStats, loadUsers, loadConfig]);

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

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "users", label: "Users" },
    { key: "system", label: "System" },
  ];

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
