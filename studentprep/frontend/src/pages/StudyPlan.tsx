import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch, UpgradeRequiredError } from "../lib/api";
import { UpgradePrompt } from "../components/UpgradePrompt";
import { useSubscriptionContext } from "../contexts/SubscriptionContext";

interface PlanDay {
  date: string;
  chapters: { id: string; title: string }[];
  total_minutes: number;
  type: "study" | "review" | "buffer";
}

interface StudyPlan {
  id: string;
  exam_date: string;
  created_at: string;
  plan: PlanDay[];
}

const DAY_TYPE_STYLES: Record<string, { bg: string; text: string; ring: string; dot: string }> = {
  study: { bg: "bg-indigo-50", text: "text-indigo-700", ring: "ring-indigo-200", dot: "bg-indigo-500" },
  review: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200", dot: "bg-amber-500" },
  buffer: { bg: "bg-gray-50", text: "text-gray-600", ring: "ring-gray-200", dot: "bg-gray-400" },
};

export default function StudyPlan() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { refresh: refreshSubscription } = useSubscriptionContext();
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [examDate, setExamDate] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);

  const loadPlans = useCallback(async () => {
    try {
      const data = await apiFetch<{ plans: StudyPlan[] }>(
        `/api/ai/study-plans/${courseId}`
      );
      setPlans(data.plans);
    } catch {
      setError("Failed to load study plans");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const createPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setGenerateError("");
    try {
      await apiFetch("/api/ai/study-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          examDate,
          hoursPerDay,
        }),
      });
      setShowForm(false);
      await loadPlans();
    } catch (err) {
      if (err instanceof UpgradeRequiredError) {
        setUpgradeError(err.message);
      } else {
        setGenerateError(err instanceof Error ? err.message : "Failed to generate plan");
      }
    } finally {
      setGenerating(false);
      refreshSubscription();
    }
  };

  const deletePlan = async (planId: string) => {
    if (!window.confirm("Delete this study plan?")) return;
    try {
      await apiFetch(`/api/ai/study-plan/${planId}`, { method: "DELETE" });
      await loadPlans();
      setActiveIdx(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete plan");
    }
  };

  const regeneratePlan = async (plan: StudyPlan) => {
    setGenerating(true);
    setGenerateError("");
    try {
      await apiFetch(`/api/ai/study-plan/${plan.id}`, { method: "DELETE" });
      await apiFetch("/api/ai/study-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          examDate: plan.exam_date,
          hoursPerDay: 3,
        }),
      });
      await loadPlans();
    } catch (err) {
      if (err instanceof UpgradeRequiredError) {
        setUpgradeError(err.message);
      } else {
        setGenerateError(err instanceof Error ? err.message : "Failed to regenerate plan");
      }
    } finally {
      setGenerating(false);
      refreshSubscription();
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50/50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (error && plans.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50/50">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const activePlan = plans[activeIdx];

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h `;
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Glassmorphic top bar */}
      <header className="glass-header sticky top-0 z-30 border-b border-gray-200/60 px-6 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <button
            onClick={() => navigate(`/course/${courseId}`)}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back to course
          </button>
          <h1 className="text-xl font-extrabold tracking-tight text-indigo-600">StudyFlow</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Study Plans</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn-press rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition shadow-sm shadow-indigo-200"
          >
            {showForm ? "Cancel" : "New plan"}
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <form
            onSubmit={createPlan}
            className="mb-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 animate-fade-in-up"
          >
            <h3 className="mb-4 font-semibold">Generate a new study schedule</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Exam date
                </label>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hours per day
                </label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            {upgradeError && (
              <div className="mt-3">
                <UpgradePrompt description={upgradeError} compact />
              </div>
            )}
            {generateError && (
              <p className="mt-3 text-sm text-red-600">{generateError}</p>
            )}
            <div className="mt-4">
              <button
                type="submit"
                disabled={generating}
                className="btn-press rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {generating ? "Generating..." : "Generate plan"}
              </button>
            </div>
          </form>
        )}

        {plans.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white py-16 text-center animate-fade-in-up">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
              <svg className="h-8 w-8 text-indigo-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-gray-700">No study plans yet.</p>
            <p className="mt-1 text-sm text-gray-400">
              Click "New plan" to generate your first study schedule.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Plan selector */}
            {plans.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {plans.map((plan, i) => (
                  <button
                    key={plan.id}
                    onClick={() => setActiveIdx(i)}
                    className={`btn-press rounded-xl px-4 py-2 text-sm font-medium transition ${
                      i === activeIdx
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Exam: {new Date(plan.exam_date + "T12:00:00").toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </button>
                ))}
              </div>
            )}

            {/* Active plan detail */}
            {activePlan && (
              <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 animate-fade-in-up">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                  <div>
                    <p className="font-semibold">
                      Exam: {new Date(activePlan.exam_date + "T12:00:00").toLocaleDateString("en-GB", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                    <p className="text-xs text-gray-400">
                      Created {new Date(activePlan.created_at).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => regeneratePlan(activePlan)}
                      disabled={generating}
                      className="btn-press rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 transition"
                    >
                      {generating ? "Generating..." : "Regenerate"}
                    </button>
                    <button
                      onClick={() => deletePlan(activePlan.id)}
                      className="btn-press rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex gap-4 px-6 py-3 border-b border-gray-100">
                  {(["study", "review", "buffer"] as const).map((type) => {
                    const s = DAY_TYPE_STYLES[type];
                    return (
                      <div key={type} className="flex items-center gap-1.5 text-xs">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.dot}`} />
                        <span className="capitalize font-medium">{type === "study" ? "Study" : type === "review" ? "Review" : "Buffer"}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Schedule — click a day to expand & launch quiz */}
                <div className="divide-y divide-gray-100">
                  {activePlan.plan.map((day, i) => {
                    const s = DAY_TYPE_STYLES[day.type] || DAY_TYPE_STYLES.buffer;
                    const isSelected = selectedDayIndex === i;
                    const hasChapters = day.chapters.length > 0;
                    return (
                      <div
                        key={i}
                        onClick={() => setSelectedDayIndex(isSelected ? null : i)}
                        className={`cursor-pointer px-6 py-3 hover:bg-gray-50/50 transition ${isSelected ? "bg-indigo-50/40" : ""}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-24 shrink-0">
                            <p className="text-sm font-medium">
                              {new Date(day.date + "T12:00:00").toLocaleDateString("en-GB", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              })}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${s.bg} ${s.text} ${s.ring}`}
                          >
                            {day.type === "study" ? "Study" : day.type === "review" ? "Review" : "Buffer"}
                          </span>
                          <div className="min-w-0 flex-1">
                            {hasChapters ? (
                              <p className={`text-sm text-gray-700 ${isSelected ? "" : "truncate"}`}>
                                {day.chapters.map((c) => c.title).join(", ")}
                              </p>
                            ) : (
                              <p className="text-sm text-gray-400 italic">
                                {day.type === "buffer" ? "Catch-up or rest" : "Review material"}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 shrink-0">
                            {formatTime(day.total_minutes)}
                          </span>
                        </div>
                        {isSelected && hasChapters && (
                          <div className="mt-3 ml-28">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const chapterIds = day.chapters.map((c) => c.id).join(",");
                                navigate(`/quiz/${courseId}?chapters=${chapterIds}`);
                              }}
                              className="btn-press rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition shadow-sm"
                            >
                              Start quiz for{" "}
                              {new Date(day.date + "T12:00:00").toLocaleDateString("en-GB", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              })}{" "}
                              chapters
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
