import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiFetch, apiUpload } from "../lib/api";
import { useSubscriptionContext } from "../contexts/SubscriptionContext";
import { PlanBadge, TokenUsageMeter } from "../components/UpgradePrompt";

interface StudyPlanSummary {
  id: string;
  exam_date: string;
  created_at: string;
  course_id: string;
}

interface Course {
  id: string;
  title: string;
  original_filename: string;
  status: string;
  created_at: string;
}

/* ── Status config with icons ── */
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  uploaded: {
    label: "Uploaded",
    color: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
    icon: (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
      </svg>
    ),
  },
  processing: {
    label: "Processing...",
    color: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    icon: (
      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
    ),
  },
  ready: {
    label: "Ready",
    color: "bg-green-50 text-green-700 ring-1 ring-green-200",
    icon: (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    ),
  },
  error: {
    label: "Error",
    color: "bg-red-50 text-red-700 ring-1 ring-red-200",
    icon: (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
  },
};

/* ── Course file emoji based on filename ── */
function courseEmoji(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "\uD83D\uDCD5";
  return "\uD83D\uDCC4";
}

export default function Dashboard({ isAdmin }: { isAdmin?: boolean }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { subscription } = useSubscriptionContext();
  const [courses, setCourses] = useState<Course[]>([]);
  const [plansByCourse, setPlansByCourse] = useState<
    Record<string, StudyPlanSummary[]>
  >({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCourses = useCallback(async () => {
    try {
      const data = await apiFetch<{ courses: Course[] }>("/api/courses");
      setCourses(data.courses);
    } catch {
      // Silently fail on initial load — user might not have courses yet
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  // Load study plans for all ready courses
  const loadPlans = useCallback(async (courseList: Course[]) => {
    const readyCourses = courseList.filter((c) => c.status === "ready");
    if (readyCourses.length === 0) return;

    const results: Record<string, StudyPlanSummary[]> = {};
    await Promise.all(
      readyCourses.map(async (course) => {
        try {
          const data = await apiFetch<{ plans: StudyPlanSummary[] }>(
            `/api/ai/study-plans/${course.id}`
          );
          if (data.plans.length > 0) {
            results[course.id] = data.plans;
          }
        } catch {
          // ignore per-course failures
        }
      })
    );
    setPlansByCourse(results);
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    if (courses.length > 0) {
      loadPlans(courses);
    }
  }, [courses, loadPlans]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      await apiUpload("/api/courses/upload", formData);
      await loadCourses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (courseId: string, courseTitle: string) => {
    if (!window.confirm(`Delete "${courseTitle}"? This will remove the course and all its data permanently.`)) {
      return;
    }
    setDeletingId(courseId);
    setError("");
    try {
      await apiFetch(`/api/courses/${courseId}`, { method: "DELETE" });
      await loadCourses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const daysUntil = (dateStr: string) => {
    const diff = Math.ceil(
      (new Date(dateStr + "T12:00:00").getTime() - Date.now()) /
        (1000 * 60 * 60 * 24)
    );
    if (diff < 0) return "past";
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    return `in ${diff} days`;
  };

  // Avatar initial from email
  const avatarInitial = user?.email?.charAt(0).toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Glassmorphic top bar */}
      <header className="glass-header sticky top-0 z-30 border-b border-gray-200/60 px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-xl font-extrabold tracking-tight text-indigo-600">StudyFlow</h1>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                onClick={() => navigate("/admin/settings")}
                className="btn-press rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100 transition"
              >
                Admin Settings
              </button>
            )}
            {/* Plan badge */}
            {subscription && <PlanBadge plan={subscription.plan} />}
            {/* Avatar menu */}
            <div className="flex items-center gap-2">
              <div className="avatar-gradient flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white">
                {avatarInitial}
              </div>
              <span className="hidden sm:inline text-sm text-gray-500 max-w-[180px] truncate">
                {user?.email}
              </span>
            </div>
            <button
              onClick={signOut}
              className="btn-press rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Token usage meter */}
        {subscription && (
          <div className="mb-6 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">AI Token Usage This Month</span>
              {subscription.plan === "free" && (
                <button
                  onClick={() => alert("Pro upgrade coming soon! Contact us for early access.")}
                  className="text-xs font-semibold text-amber-600 hover:text-amber-700 transition"
                >
                  Upgrade for unlimited
                </button>
              )}
            </div>
            <TokenUsageMeter
              used={subscription.usage.tokensThisMonth}
              max={subscription.limits.maxTokensPerMonth}
            />
          </div>
        )}

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">My courses</h2>
            <p className="mt-1 text-sm text-gray-500">
              {courses.length > 0
                ? `${courses.length} course${courses.length !== 1 ? "s" : ""}`
                : "Get started by uploading a PDF"}
            </p>
          </div>
          <label className="btn-press cursor-pointer rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white transition hover:bg-indigo-700 shadow-sm shadow-indigo-200">
            {uploading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Uploading...
              </span>
            ) : (
              "Upload PDF"
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200 animate-fade-in-up">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        {/* Skeleton loading state */}
        {loadingCourses ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
                <div className="flex items-center gap-4">
                  <div className="skeleton h-12 w-12 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-2/3" />
                    <div className="skeleton h-3 w-1/4" />
                  </div>
                  <div className="skeleton h-6 w-20 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          /* Enhanced empty state */
          <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white py-16 text-center animate-fade-in-up">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-50">
              <svg className="h-10 w-10 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-gray-700">
              No courses yet. Upload your first PDF!
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Supports PDF files up to 50 MB. We'll extract chapters and create study materials.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {courses.map((course) => {
              const coursePlans = plansByCourse[course.id];
              const nextPlan = coursePlans?.[0];
              const status = STATUS_CONFIG[course.status];

              return (
                <div
                  key={course.id}
                  className="card-interactive rounded-xl bg-white shadow-sm ring-1 ring-gray-100"
                >
                  {/* Course row */}
                  <div className="flex w-full items-center justify-between p-4 sm:p-5">
                    <button
                      onClick={() => navigate(`/course/${course.id}`)}
                      className="flex flex-1 items-center gap-4 text-left"
                    >
                      {/* Course thumbnail/emoji */}
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-2xl">
                        {courseEmoji(course.original_filename)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-900 truncate">{course.title}</h3>
                        <div className="mt-0.5 flex items-center gap-2 text-sm text-gray-400">
                          <span>
                            {new Date(course.created_at).toLocaleDateString("en-GB")}
                          </span>
                          <span className="text-gray-300">&#183;</span>
                          <span className="truncate text-xs">{course.original_filename}</span>
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-3 ml-3">
                      {/* Status chip with icon */}
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${status?.color || ""}`}
                      >
                        {status?.icon}
                        {status?.label || course.status}
                      </span>
                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(course.id, course.title);
                        }}
                        disabled={deletingId === course.id}
                        className="rounded-lg p-2 text-gray-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 transition"
                        title="Delete course"
                      >
                        {deletingId === course.id ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Study plan info */}
                  {nextPlan && (
                    <div className="border-t border-gray-100 px-4 sm:px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <svg className="h-4 w-4 text-indigo-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                        </svg>
                        <span>
                          Exam{" "}
                          {new Date(
                            nextPlan.exam_date + "T12:00:00"
                          ).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          <span className="text-gray-400">
                            ({daysUntil(nextPlan.exam_date)})
                          </span>
                        </span>
                        {coursePlans.length > 1 && (
                          <span className="text-xs text-gray-400">
                            +{coursePlans.length - 1} more plan
                            {coursePlans.length > 2 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/study-plan/${course.id}`);
                        }}
                        className="btn-press rounded-lg bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 transition"
                      >
                        View plan
                      </button>
                    </div>
                  )}

                  {/* Quick actions for ready courses without plans */}
                  {course.status === "ready" && !nextPlan && (
                    <div className="border-t border-gray-100 px-4 sm:px-5 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/study-plan/${course.id}`);
                        }}
                        className="text-xs font-semibold text-indigo-600 hover:underline"
                      >
                        Create a study plan
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
