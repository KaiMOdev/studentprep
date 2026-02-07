import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiFetch, apiUpload } from "../lib/api";

interface Course {
  id: string;
  title: string;
  original_filename: string;
  status: string;
  created_at: string;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCourses = useCallback(async () => {
    try {
      const data = await apiFetch<{ courses: Course[] }>("/api/courses");
      setCourses(data.courses);
    } catch {
      // Silently fail on initial load — user might not have courses yet
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-600">StudyFlow</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user?.email}</span>
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
            {courses.map((course) => (
              <button
                key={course.id}
                onClick={() => navigate(`/course/${course.id}`)}
                className="flex w-full items-center justify-between rounded-lg bg-white p-4 shadow-sm text-left transition hover:shadow-md"
              >
                <div>
                  <h3 className="font-medium">{course.title}</h3>
                  <p className="text-sm text-gray-500">
                    {new Date(course.created_at).toLocaleDateString("en-GB")}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor[course.status] || ""}`}
                >
                  {statusLabel[course.status] || course.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
