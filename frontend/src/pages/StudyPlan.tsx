import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

interface PlanDay {
  date: string;
  chapters: { id: string; title: string }[];
  total_minutes: number;
  type: "study" | "review" | "buffer";
}

interface Plan {
  id: string;
  exam_date: string;
  plan: PlanDay[];
  created_at: string;
}

export default function StudyPlan() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [examDate, setExamDate] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const loadPlan = useCallback(async () => {
    if (!courseId) return;
    try {
      // Try to load existing plan
      const data = await apiFetch<{ course: any; chapters: any[] }>(
        `/api/courses/${courseId}`
      );
      // Check if plan exists via a separate call would be complex,
      // so we'll just show the create form if no plan is loaded
    } catch {
      // ignore
    }
  }, [courseId]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const createPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId || !examDate) return;

    setGenerating(true);
    setError("");

    try {
      const data = await apiFetch<{ plan: Plan }>("/api/ai/study-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, examDate, hoursPerDay }),
      });
      setPlan(data.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate plan");
    } finally {
      setGenerating(false);
    }
  };

  const typeColor: Record<string, string> = {
    study: "bg-indigo-50 border-indigo-300",
    review: "bg-yellow-50 border-yellow-300",
    buffer: "bg-gray-50 border-gray-300",
  };

  const typeLabel: Record<string, string> = {
    study: "Study",
    review: "Review",
    buffer: "Buffer",
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <button
            onClick={() => navigate(`/course/${courseId}`)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to course
          </button>
          <h1 className="text-xl font-bold text-indigo-600">StudyFlow</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h2 className="mb-6 text-3xl font-bold">Study Plan</h2>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!plan && (
          <form
            onSubmit={createPlan}
            className="mb-8 rounded-xl bg-white p-6 shadow-sm"
          >
            <h3 className="mb-4 text-lg font-semibold">
              Generate your study schedule
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Exam date
                </label>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  min={today}
                  required
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Hours per day
                </label>
                <input
                  type="number"
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(Number(e.target.value))}
                  min={1}
                  max={12}
                  required
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={generating}
              className="mt-4 rounded-lg bg-indigo-600 px-6 py-2 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {generating ? "Generating..." : "Generate plan"}
            </button>
          </form>
        )}

        {plan && (
          <div className="space-y-3">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Exam: {new Date(plan.exam_date).toLocaleDateString("en-GB")}
              </p>
              <button
                onClick={() => setPlan(null)}
                className="text-sm text-indigo-600 hover:underline"
              >
                Create new plan
              </button>
            </div>

            {plan.plan.map((day, i) => {
              const isToday = day.date === today;
              const isPast = day.date < today;

              return (
                <div
                  key={i}
                  className={`rounded-lg border p-4 ${typeColor[day.type]} ${isPast ? "opacity-50" : ""} ${isToday ? "ring-2 ring-indigo-500" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {new Date(day.date + "T12:00:00").toLocaleDateString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                        {isToday && (
                          <span className="ml-2 rounded bg-indigo-600 px-2 py-0.5 text-xs text-white">
                            Today
                          </span>
                        )}
                      </p>
                      {day.chapters.length > 0 && (
                        <p className="mt-1 text-sm text-gray-600">
                          {day.chapters.map((ch) => ch.title).join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-medium">
                        {typeLabel[day.type]}
                      </span>
                      <p className="mt-1 text-xs text-gray-500">
                        {Math.round(day.total_minutes / 60)}h{" "}
                        {day.total_minutes % 60 > 0
                          ? `${day.total_minutes % 60}m`
                          : ""}
                      </p>
                    </div>
                  </div>

                  {isToday && day.type === "study" && day.chapters.length > 0 && (
                    <button
                      onClick={() =>
                        navigate(
                          `/quiz/${courseId}?chapters=${day.chapters.map((ch) => ch.id).join(",")}`
                        )
                      }
                      className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      Start quiz for today's chapters
                    </button>
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
