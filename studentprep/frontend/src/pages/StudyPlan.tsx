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
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [examDate, setExamDate] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);

  const loadPlans = useCallback(async () => {
    if (!courseId) return;
    try {
      const data = await apiFetch<{ plans: Plan[] }>(
        `/api/ai/study-plans/${courseId}`
      );
      setPlans(data.plans);
      // Auto-select the most recent plan
      if (data.plans.length > 0 && !activePlan) {
        const plan = data.plans[0];
        setActivePlan(plan);
        // Auto-select today's day if it exists in the plan
        const todayStr = new Date().toISOString().split("T")[0];
        const todayIdx = plan.plan.findIndex(
          (d: PlanDay) => d.date === todayStr
        );
        if (todayIdx !== -1) {
          setSelectedDayIndex(todayIdx);
        }
      }
    } catch {
      setError("Failed to load study plans");
    } finally {
      setLoading(false);
    }
  }, [courseId, activePlan]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

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
      setActivePlan(data.plan);
      setPlans((prev) => [data.plan, ...prev]);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate plan");
    } finally {
      setGenerating(false);
    }
  };

  const deletePlan = async (planId: string) => {
    try {
      await apiFetch(`/api/ai/study-plan/${planId}`, { method: "DELETE" });
      setPlans((prev) => prev.filter((p) => p.id !== planId));
      if (activePlan?.id === planId) {
        const remaining = plans.filter((p) => p.id !== planId);
        setActivePlan(remaining.length > 0 ? remaining[0] : null);
      }
    } catch {
      setError("Failed to delete plan");
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
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-3xl font-bold">Study Plans</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {showForm ? "Cancel" : "New plan"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Create form */}
        {showForm && (
          <form
            onSubmit={createPlan}
            className="mb-8 rounded-xl bg-white p-6 shadow-sm"
          >
            <h3 className="mb-4 text-lg font-semibold">
              Generate a new study schedule
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

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          </div>
        )}

        {/* No plans yet */}
        {!loading && plans.length === 0 && !showForm && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 text-center">
            <p className="text-lg text-gray-500">No study plans yet.</p>
            <p className="mt-1 text-sm text-gray-400">
              Click "New plan" to generate your first study schedule.
            </p>
          </div>
        )}

        {/* Plan selector (when multiple plans exist) */}
        {!loading && plans.length > 1 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setActivePlan(p);
                  const todayIdx = p.plan.findIndex(
                    (d) => d.date === today
                  );
                  setSelectedDayIndex(
                    todayIdx !== -1 ? todayIdx : null
                  );
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  activePlan?.id === p.id
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Exam:{" "}
                {new Date(p.exam_date + "T12:00:00").toLocaleDateString(
                  "en-GB",
                  { day: "numeric", month: "short" }
                )}
                <span className="ml-1 text-xs text-gray-400">
                  (created{" "}
                  {new Date(p.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                  )
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Active plan view */}
        {activePlan && (
          <div className="space-y-3">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Exam:{" "}
                {new Date(
                  activePlan.exam_date + "T12:00:00"
                ).toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setExamDate(activePlan.exam_date);
                    setShowForm(true);
                  }}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  Regenerate
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this study plan?")) {
                      deletePlan(activePlan.id);
                    }
                  }}
                  className="text-sm text-red-500 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Legend */}
            <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
            <div className="flex gap-4">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-indigo-300 bg-indigo-50" />{" "}
                Study
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-yellow-300 bg-yellow-50" />{" "}
                Review
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-gray-300 bg-gray-50" />{" "}
                Buffer
              </span>
            </div>
              <span className="text-gray-400">Click a day to start its quiz</span>
            </div>

            {activePlan.plan.map((day, i) => {
              const isToday = day.date === today;
              const isPast = day.date < today;
              const isSelected = selectedDayIndex === i;
              const hasChapters = day.chapters.length > 0;

              return (
                <div
                  key={i}
                  onClick={() =>
                    setSelectedDayIndex(isSelected ? null : i)
                  }
                  className={`cursor-pointer rounded-lg border p-4 transition ${typeColor[day.type]} ${isPast && !isSelected ? "opacity-50" : ""} ${isToday ? "ring-2 ring-indigo-500" : ""} ${isSelected && !isToday ? "ring-2 ring-indigo-400" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {new Date(
                          day.date + "T12:00:00"
                        ).toLocaleDateString("en-GB", {
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
                      {hasChapters && (
                        <p className="mt-1 text-sm text-gray-600">
                          {day.chapters.map((ch) => ch.title).join(", ")}
                        </p>
                      )}
                      {!hasChapters && day.type === "buffer" && (
                        <p className="mt-1 text-sm text-gray-400">
                          Rest day &mdash; no chapters scheduled
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

                  {isSelected && hasChapters && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(
                          `/quiz/${courseId}?chapters=${day.chapters.map((ch) => ch.id).join(",")}`
                        );
                      }}
                      className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      Start quiz for{" "}
                      {isToday ? "today's" : `${new Date(day.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}{" "}
                      chapters
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
