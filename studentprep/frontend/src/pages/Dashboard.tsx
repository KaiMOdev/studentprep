import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiFetch, apiUpload } from "../lib/api";

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

export default function Dashboard({ isAdmin }: { isAdmin?: boolean }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [plansByCourse, setPlansByCourse] = useState<
    Record<string, StudyPlanSummary[]>
  >({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCourses = useCallback(async () => {
    try {
      const data = await apiFetch<{ courses: Course[] }>("/api/courses");
      setCourses(data.courses);
    } catch {
      // Silently fail on initial load — user might not have courses yet
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

  const statusLabel: Record<string, string> = {
    uploaded: "Uploaded",
    processing: "Processing...",
    ready: "Ready",
    error: "Error",
  };

  const statusColor: Record<string, string> = {
    uploaded: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    ready: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-600">StudyFlow</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user?.email}</span>
            {isAdmin && (
              <button
                onClick={() => navigate("/admin/settings")}
                className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                Admin Settings
              </button>
            )}
            <button
              onClick={signOut}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-semibold">My courses</h2>
          <label className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white transition hover:bg-indigo-700">
            {uploading ? "Uploading..." : "Upload PDF"}
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
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {courses.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 py-16 text-center">
            <p className="text-lg text-gray-500">
              No courses yet. Upload your first PDF!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {courses.map((course) => {
              const coursePlans = plansByCourse[course.id];
              const nextPlan = coursePlans?.[0]; // most recent plan

              return (
                <div
                  key={course.id}
                  className="rounded-lg bg-white shadow-sm transition hover:shadow-md"
                >
                  {/* Course row */}
                  <div className="flex w-full items-center justify-between p-4">
                    <button
                      onClick={() => navigate(`/course/${course.id}`)}
                      className="flex flex-1 items-center justify-between text-left"
                    >
                      <div>
                        <h3 className="font-medium">{course.title}</h3>
                        <p className="text-sm text-gray-500">
                          {new Date(course.created_at).toLocaleDateString(
                            "en-GB"
                          )}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor[course.status] || ""}`}
                      >
                        {statusLabel[course.status] || course.status}
                      </span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(course.id, course.title);
                      }}
                      disabled={deletingId === course.id}
                      className="ml-3 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
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

                  {/* Study plan info */}
                  {nextPlan && (
                    <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="inline-block h-2 w-2 rounded-full bg-indigo-400" />
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
                        className="rounded-md bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
                      >
                        View plan
                      </button>
                    </div>
                  )}

                  {/* Quick actions for ready courses without plans */}
                  {course.status === "ready" && !nextPlan && (
                    <div className="border-t border-gray-100 px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/study-plan/${course.id}`);
                        }}
                        className="text-xs font-medium text-indigo-600 hover:underline"
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
