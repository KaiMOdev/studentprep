import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch, apiFetchBlob, UpgradeRequiredError } from "../lib/api";
import { UpgradePrompt } from "../components/UpgradePrompt";
import { useSubscriptionContext } from "../contexts/SubscriptionContext";

interface KeyTerm {
  term: string;
  definition: string;
}

interface MainTopic {
  topic: string;
  explanation: string;
  key_terms: (KeyTerm | string)[];
}

interface SideTopic {
  topic: string;
  explanation: string;
}

interface Chapter {
  id: string;
  title: string;
  summary_main: MainTopic[] | null;
  summary_side: SideTopic[] | null;
  sort_order: number;
}

interface Translations {
  nl?: string;
  fr?: string;
  zh?: string;
  hi?: string;
  es?: string;
  ar?: string;
}

interface Question {
  id: string;
  chapter_id: string;
  type: "exam" | "discussion";
  question: string;
  suggested_answer: string;
  question_translations?: Translations;
  answer_translations?: Translations;
}

type Language = "en" | "nl" | "fr" | "zh" | "hi" | "es" | "ar";
type TranslateLang = "nl" | "fr" | "zh" | "hi" | "es" | "ar";

const TRANSLATE_OPTIONS: { lang: TranslateLang; flag: string }[] = [
  { lang: "nl", flag: "\uD83C\uDDF3\uD83C\uDDF1" },
  { lang: "fr", flag: "\uD83C\uDDEB\uD83C\uDDF7" },
  { lang: "zh", flag: "\uD83C\uDDE8\uD83C\uDDF3" },
  { lang: "hi", flag: "\uD83C\uDDEE\uD83C\uDDF3" },
  { lang: "es", flag: "\uD83C\uDDEA\uD83C\uDDF8" },
  { lang: "ar", flag: "\uD83C\uDDF8\uD83C\uDDE6" },
];

function TranslateButtons({
  questionId,
  field,
  activeLang,
  onTranslated,
  translations,
  colorScheme,
}: {
  questionId: string;
  field: "question" | "answer";
  activeLang: Language;
  onTranslated: (lang: Language, text: string) => void;
  translations?: Translations;
  colorScheme: "indigo" | "purple";
}) {
  const [loading, setLoading] = useState<TranslateLang | null>(null);

  const colors = {
    indigo: {
      active: "bg-indigo-600 text-white",
      inactive: "bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-100",
      original: "bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-100",
      originalActive: "bg-indigo-600 text-white",
    },
    purple: {
      active: "bg-purple-600 text-white",
      inactive: "bg-white text-purple-700 border-purple-300 hover:bg-purple-100",
      original: "bg-white text-purple-700 border-purple-300 hover:bg-purple-100",
      originalActive: "bg-purple-600 text-white",
    },
  }[colorScheme];

  const handleTranslate = async (targetLang: TranslateLang) => {
    if (activeLang === targetLang) {
      onTranslated("en", "");
      return;
    }

    if (translations?.[targetLang]) {
      onTranslated(targetLang, translations[targetLang]!);
      return;
    }

    setLoading(targetLang);
    try {
      const data = await apiFetch<{ translation: string }>("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, field, targetLang }),
      });
      onTranslated(targetLang, data.translation);
    } catch {
      // Translation failed — stay on current language
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onTranslated("en", "")}
        className={`inline-flex items-center justify-center rounded-l-md border px-2.5 py-1.5 text-base leading-none transition ${
          activeLang === "en" ? colors.originalActive : colors.original
        }`}
        title="English"
      >
        {"\uD83C\uDDEC\uD83C\uDDE7"}
      </button>
      {TRANSLATE_OPTIONS.map((opt) => (
        <button
          key={opt.lang}
          onClick={() => handleTranslate(opt.lang)}
          disabled={loading !== null}
          className={`inline-flex items-center justify-center border px-2.5 py-1.5 text-base leading-none transition last:rounded-r-md ${
            activeLang === opt.lang ? colors.active : colors.inactive
          } disabled:opacity-50`}
          title={opt.lang.toUpperCase()}
        >
          {loading === opt.lang ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            opt.flag
          )}
        </button>
      ))}
    </div>
  );
}

interface WikiResult {
  title: string;
  extract: string;
  url: string;
  thumbnail?: string;
}

interface CourseData {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

interface ProcessingProgress {
  step: "extracting" | "detecting" | "saving_chapters" | "done" | "unknown";
  currentChapter: number;
  totalChapters: number;
  chapterTitle: string;
}

interface AIModelOption {
  id: string;
  label: string;
}

const FALLBACK_MODELS: AIModelOption[] = [
  { id: "claude-sonnet-4-5-20250929", label: "Sonnet 4.5" },
  { id: "claude-opus-4-6", label: "Opus 4.6" },
];

/* ── Processing stepper config ── */
const STEPPER_STEPS = [
  { key: "extracting", label: "Extract" },
  { key: "detecting", label: "Detect" },
  { key: "saving_chapters", label: "Outline" },
  { key: "done", label: "Done" },
] as const;

function stepIndex(step: string): number {
  const idx = STEPPER_STEPS.findIndex((s) => s.key === step);
  return idx >= 0 ? idx : 0;
}

export default function Course() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refresh: refreshSubscription } = useSubscriptionContext();
  const [course, setCourse] = useState<CourseData | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [models, setModels] = useState<AIModelOption[]>(FALLBACK_MODELS);
  const [selectedModel, setSelectedModel] = useState<string>("claude-sonnet-4-5-20250929");
  const [generatingQuestions, setGeneratingQuestions] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [summarizingChapter, setSummarizingChapter] = useState<string | null>(null);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);
  const [wikiResult, setWikiResult] = useState<WikiResult | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiError, setWikiError] = useState<string | null>(null);
  const [wikiTopic, setWikiTopic] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const loadCourse = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiFetch<{
        course: CourseData;
        chapters: Chapter[];
        questions: Question[];
      }>(`/api/courses/${id}`);
      setCourse(data.course);
      setChapters(data.chapters);
      setQuestions(data.questions);
    } catch {
      setError("Failed to load course");
    }
  }, [id]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  useEffect(() => {
    apiFetch<{ models: AIModelOption[]; default: string }>("/api/ai/models")
      .then((data) => {
        setModels(data.models);
        setSelectedModel(data.default);
      })
      .catch(() => {
        // Use fallback models
      });
  }, []);

  // Poll while processing
  useEffect(() => {
    if (course?.status !== "processing") {
      setProgress(null);
      return;
    }

    const pollProgress = async () => {
      try {
        const data = await apiFetch<ProcessingProgress>(`/api/ai/progress/${id}`);
        setProgress(data);
      } catch {
        // ignore polling errors
      }
    };

    pollProgress();
    const progressInterval = setInterval(pollProgress, 2000);
    const courseInterval = setInterval(loadCourse, 5000);
    return () => {
      clearInterval(progressInterval);
      clearInterval(courseInterval);
    };
  }, [course?.status, loadCourse, id]);

  const startProcessing = async () => {
    if (!id) return;
    setProcessing(true);
    setError("");
    try {
      await apiFetch(`/api/ai/summarize/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel }),
      });
      await loadCourse();
    } catch (err) {
      if (err instanceof UpgradeRequiredError) {
        setUpgradeError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Processing failed");
      }
    } finally {
      setProcessing(false);
      refreshSubscription();
    }
  };

  const cancelProcessing = async () => {
    if (!id) return;
    setCancelling(true);
    try {
      await apiFetch(`/api/ai/cancel/${id}`, { method: "POST" });
      await loadCourse();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  };

  const getChapterQuestions = (chapterId: string) =>
    questions.filter((q) => q.chapter_id === chapterId);

  const generateChapterQuestions = async (chapterId: string) => {
    setGeneratingQuestions(chapterId);
    setGenerateError(null);
    try {
      await apiFetch(`/api/ai/questions/${chapterId}`, { method: "POST" });
      await loadCourse();
    } catch (err) {
      if (err instanceof UpgradeRequiredError) {
        setUpgradeError(err.message);
      } else {
        setGenerateError(
          err instanceof Error ? err.message : "Failed to generate questions"
        );
      }
    } finally {
      setGeneratingQuestions(null);
      refreshSubscription();
    }
  };

  const summarizeChapterById = async (chapterId: string) => {
    setSummarizingChapter(chapterId);
    setSummarizeError(null);
    try {
      await apiFetch(`/api/ai/summarize-chapter/${chapterId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel }),
      });
      await loadCourse();
    } catch (err) {
      if (err instanceof UpgradeRequiredError) {
        setUpgradeError(err.message);
      } else {
        setSummarizeError(
          err instanceof Error ? err.message : "Failed to summarize chapter"
        );
      }
    } finally {
      setSummarizingChapter(null);
      refreshSubscription();
    }
  };

  const lookupWiki = async (chapterId: string, topic: string) => {
    setWikiTopic(topic);
    setWikiResult(null);
    setWikiError(null);
    setWikiLoading(true);
    try {
      const data = await apiFetch<WikiResult>(
        `/api/chapters/${chapterId}/wiki/${encodeURIComponent(topic)}`
      );
      setWikiResult(data);
    } catch {
      setWikiError("No Wikipedia article found for this topic.");
    } finally {
      setWikiLoading(false);
    }
  };

  const closeWiki = () => {
    setWikiResult(null);
    setWikiError(null);
    setWikiTopic(null);
  };

  const exportHighlightedPdf = async () => {
    if (!id) return;
    setExportingPdf(true);
    setExportError(null);
    try {
      const blob = await apiFetchBlob(`/api/pdf/highlighted/${id}`, {
        method: "POST",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${course?.title || "course"}_StudyFlow.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to export PDF"
      );
    } finally {
      setExportingPdf(false);
    }
  };

  if (!course) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50/50">
        {error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        )}
      </div>
    );
  }

  const isProcessing = course.status === "processing";
  const isReady = course.status === "ready";
  const isUploaded = course.status === "uploaded";

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Glassmorphic top bar */}
      <header className="glass-header sticky top-0 z-30 border-b border-gray-200/60 px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back to courses
          </button>
          <h1 className="text-xl font-extrabold tracking-tight text-indigo-600">StudyFlow</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Course header */}
        <div className="mb-8">
          <h2 className="text-3xl font-extrabold tracking-tight">{course.title}</h2>
          <p className="mt-1 text-sm text-gray-500">
            Uploaded {new Date(course.created_at).toLocaleDateString("en-GB")}
          </p>
        </div>

        {upgradeError && (
          <div className="mb-4">
            <UpgradePrompt description={upgradeError} compact />
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200 animate-fade-in-up">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        {/* Status + action: Uploaded */}
        {isUploaded && (
          <div className="mb-8 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-8 text-center animate-fade-in-up">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100">
              <svg className="h-7 w-7 text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
              </svg>
            </div>
            <p className="mb-4 text-lg font-semibold text-gray-700">
              PDF uploaded. Ready to process with AI?
            </p>
            <div className="mb-4 flex items-center justify-center gap-3">
              <label className="text-sm font-medium text-gray-600">
                Model:
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={processing}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={startProcessing}
              disabled={processing}
              className="btn-press rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 shadow-sm shadow-indigo-200"
            >
              {processing ? "Starting..." : "Summarize with AI"}
            </button>
          </div>
        )}

        {/* Processing state with stepper */}
        {isProcessing && (
          <div className="mb-8 rounded-2xl bg-gradient-to-br from-blue-50 to-white p-8 ring-1 ring-blue-100 animate-fade-in-up">
            {/* Stepper */}
            <div className="mx-auto mb-6 max-w-lg">
              <div className="relative flex items-center justify-between">
                {/* Background line */}
                <div className="stepper-line" />
                {/* Active line */}
                <div
                  className="stepper-line stepper-line-active"
                  style={{
                    width: progress
                      ? `${(stepIndex(progress.step) / (STEPPER_STEPS.length - 1)) * 100}%`
                      : "0%",
                  }}
                />
                {STEPPER_STEPS.map((step, i) => {
                  const currentIdx = progress ? stepIndex(progress.step) : -1;
                  const isActive = i === currentIdx;
                  const isDone = i < currentIdx;
                  return (
                    <div key={step.key} className="relative z-10 flex flex-col items-center">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                          isDone
                            ? "bg-indigo-600 text-white"
                            : isActive
                              ? "bg-indigo-600 text-white ring-4 ring-indigo-100"
                              : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        {isDone ? (
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          i + 1
                        )}
                      </div>
                      <span className={`mt-1.5 text-xs font-medium ${isActive || isDone ? "text-indigo-700" : "text-gray-400"}`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step label */}
            <div className="mb-3 flex items-center justify-center gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-blue-500 border-t-transparent" />
              <p className="text-lg font-semibold text-blue-700">
                {!progress || progress.step === "unknown"
                  ? "Starting..."
                  : progress.step === "extracting"
                    ? "Extracting text from PDF..."
                    : progress.step === "detecting"
                      ? "Detecting chapters..."
                      : progress.step === "saving_chapters"
                        ? `Outlining chapter ${progress.currentChapter} of ${progress.totalChapters}`
                        : "Finishing up..."}
              </p>
            </div>

            {/* Chapter title */}
            {progress?.step === "saving_chapters" && progress.chapterTitle && (
              <p className="mb-4 text-center text-sm text-blue-600 truncate">
                {progress.chapterTitle}
              </p>
            )}

            {/* Progress bar */}
            {progress && progress.totalChapters > 0 ? (
              <div className="mx-auto max-w-md">
                <div className="mb-2 h-3 overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-500"
                    style={{
                      width: `${Math.round((progress.currentChapter / progress.totalChapters) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-center text-xs text-blue-500">
                  {progress.currentChapter} / {progress.totalChapters} chapters
                </p>
              </div>
            ) : (
              <div className="mx-auto max-w-md">
                <div className="mb-2 h-3 overflow-hidden rounded-full bg-blue-100">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-400" />
                </div>
                <p className="text-center text-xs text-blue-500">
                  Preparing your course...
                </p>
              </div>
            )}

            <div className="mt-4 text-center">
              <button
                onClick={cancelProcessing}
                disabled={cancelling}
                className="btn-press rounded-xl border border-red-200 bg-white px-5 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
              >
                {cancelling ? "Stopping..." : "Stop processing"}
              </button>
            </div>
          </div>
        )}

        {course.status === "error" && (
          <div className="mb-8 rounded-2xl bg-red-50 p-8 text-center ring-1 ring-red-200 animate-fade-in-up">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
              <svg className="h-7 w-7 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-red-700">
              Something went wrong while processing.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <label className="text-sm font-medium text-gray-600">
                Model:
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={processing}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={startProcessing}
              disabled={processing}
              className="btn-press mt-4 rounded-xl bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {processing ? "Starting..." : "Retry"}
            </button>
          </div>
        )}

        {/* Action buttons */}
        {isReady && chapters.length > 0 && (() => {
          const chaptersWithQuestions = chapters.filter((c) =>
            questions.some((q) => q.chapter_id === c.id)
          );
          return (
            <div className="mb-8 flex flex-wrap gap-3">
              <button
                onClick={() => navigate(`/study-plan/${id}`)}
                className="btn-press rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700 shadow-sm shadow-indigo-200 transition"
              >
                Create Study Plan
              </button>
              {chaptersWithQuestions.length > 0 ? (
                <button
                  onClick={() =>
                    navigate(
                      `/quiz/${id}?chapters=${chaptersWithQuestions.map((c) => c.id).join(",")}`
                    )
                  }
                  className="btn-press rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-2.5 font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                >
                  Start Quiz ({chaptersWithQuestions.length === chapters.length
                    ? "all chapters"
                    : `${chaptersWithQuestions.length} of ${chapters.length} chapters`})
                </button>
              ) : (
                <span className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-2.5 text-sm text-gray-400">
                  No chapters have questions yet
                </span>
              )}
              <button
                onClick={exportHighlightedPdf}
                disabled={exportingPdf}
                className="btn-press rounded-xl border border-yellow-300 bg-yellow-50 px-5 py-2.5 font-semibold text-yellow-700 hover:bg-yellow-100 disabled:opacity-50 transition"
              >
                {exportingPdf ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-yellow-600 border-t-transparent" />
                    Generating PDF...
                  </span>
                ) : (
                  "Export Highlighted PDF"
                )}
              </button>
              {exportError && (
                <p className="w-full text-sm text-red-600">{exportError}</p>
              )}
            </div>
          );
        })()}

        {/* Chapters */}
        {isReady && chapters.length > 0 && (
          <div className="space-y-4">
            {chapters.map((chapter) => {
              const isExpanded = expandedChapter === chapter.id;
              const chapterQuestions = getChapterQuestions(chapter.id);
              const examQs = chapterQuestions.filter(
                (q) => q.type === "exam"
              );
              const discussionQs = chapterQuestions.filter(
                (q) => q.type === "discussion"
              );

              return (
                <div
                  key={chapter.id}
                  className="card-interactive overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100"
                >
                  {/* Chapter header */}
                  <div className="flex w-full items-center justify-between px-6 py-4 hover:bg-gray-50 transition">
                    <button
                      onClick={() =>
                        setExpandedChapter(isExpanded ? null : chapter.id)
                      }
                      className="flex flex-1 items-center text-left"
                    >
                      <h3 className="text-lg font-semibold">
                        {chapter.title}
                      </h3>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          lookupWiki(chapter.id, chapter.title);
                        }}
                        title={`Look up "${chapter.title}" on Wikipedia`}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-5 w-5"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                          <path d="M2 12h20" />
                        </svg>
                      </button>
                      <button
                        onClick={() =>
                          setExpandedChapter(isExpanded ? null : chapter.id)
                        }
                        className={`flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      >
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t px-6 py-6 space-y-8 animate-fade-in-up">
                      {/* Summarize button when no summary exists */}
                      {(!chapter.summary_main || chapter.summary_main.length === 0) && (
                        <section className="rounded-xl border border-yellow-200 bg-gradient-to-br from-yellow-50 to-white p-6 text-center">
                          <p className="text-gray-600 mb-3">
                            This chapter has not been summarized yet.
                          </p>
                          <button
                            onClick={() => summarizeChapterById(chapter.id)}
                            disabled={summarizingChapter === chapter.id}
                            className="btn-press rounded-xl bg-yellow-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-yellow-600 disabled:opacity-50"
                          >
                            {summarizingChapter === chapter.id ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                Summarizing...
                              </span>
                            ) : (
                              "Summarize Chapter"
                            )}
                          </button>
                          {summarizeError && summarizingChapter !== chapter.id && (
                            <p className="mt-2 text-sm text-red-600">
                              {summarizeError}
                            </p>
                          )}
                        </section>
                      )}

                      {/* Main topics */}
                      {chapter.summary_main &&
                        chapter.summary_main.length > 0 && (
                          <section>
                            <h4 className="mb-3 flex items-center gap-2 font-semibold text-yellow-700">
                              <span className="inline-block h-3 w-3 rounded-sm bg-yellow-400" />
                              Main Topics
                            </h4>
                            <div className="space-y-3">
                              {chapter.summary_main.map((topic, i) => (
                                <div
                                  key={i}
                                  className="rounded-xl border-l-4 border-yellow-400 bg-yellow-50/80 p-4"
                                >
                                  <button
                                    type="button"
                                    onClick={() => lookupWiki(chapter.id, topic.topic)}
                                    title={`Look up "${topic.topic}" on Wikipedia`}
                                    className="font-medium text-left hover:text-blue-700 hover:underline transition"
                                  >
                                    {topic.topic}
                                  </button>
                                  <p className="mt-1 text-sm text-gray-700">
                                    {topic.explanation}
                                  </p>
                                  {topic.key_terms &&
                                    topic.key_terms.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {topic.key_terms.map((term, j) => {
                                          const label = typeof term === "string" ? term : term.term;
                                          const tooltip = typeof term === "string" ? undefined : term.definition;
                                          return (
                                            <button
                                              type="button"
                                              key={j}
                                              title={tooltip ? `${tooltip} (click for Wikipedia)` : "Click for Wikipedia"}
                                              onClick={() => lookupWiki(chapter.id, label)}
                                              className="rounded-lg bg-yellow-200 px-2.5 py-0.5 text-xs font-medium text-yellow-800 hover:bg-yellow-300 hover:underline cursor-pointer transition"
                                            >
                                              {label}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                </div>
                              ))}
                            </div>
                          </section>
                        )}

                      {/* Side topics */}
                      {chapter.summary_side &&
                        chapter.summary_side.length > 0 && (
                          <section>
                            <h4 className="mb-3 flex items-center gap-2 font-semibold text-green-700">
                              <span className="inline-block h-3 w-3 rounded-sm bg-green-400" />
                              Side Topics
                            </h4>
                            <div className="space-y-3">
                              {chapter.summary_side.map((topic, i) => (
                                <div
                                  key={i}
                                  className="rounded-xl border-l-4 border-green-400 bg-green-50/80 p-4"
                                >
                                  <p className="font-medium">{topic.topic}</p>
                                  <p className="mt-1 text-sm text-gray-700">
                                    {topic.explanation}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}

                      {/* Exam questions */}
                      {examQs.length > 0 && (
                        <section>
                          <h4 className="mb-3 font-semibold text-indigo-700">
                            Exam Questions
                          </h4>
                          <div className="space-y-3">
                            {examQs.map((q, i) => (
                              <ExamQuestion key={q.id} index={i + 1} q={q} />
                            ))}
                          </div>
                        </section>
                      )}

                      {/* Discussion questions */}
                      {discussionQs.length > 0 && (
                        <section>
                          <h4 className="mb-3 font-semibold text-purple-700">
                            Discussion Questions
                          </h4>
                          <div className="space-y-3">
                            {discussionQs.map((q, i) => (
                              <DiscussionQuestion
                                key={q.id}
                                index={i + 1}
                                q={q}
                              />
                            ))}
                          </div>
                        </section>
                      )}

                      {/* No questions available */}
                      {examQs.length === 0 && discussionQs.length === 0 && (
                        <section className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
                          <p className="text-gray-500">
                            No questions available for this chapter.
                          </p>
                          <button
                            onClick={() =>
                              generateChapterQuestions(chapter.id)
                            }
                            disabled={generatingQuestions === chapter.id}
                            className="btn-press mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {generatingQuestions === chapter.id ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                Generating...
                              </span>
                            ) : (
                              "Generate Questions"
                            )}
                          </button>
                          {generateError && generatingQuestions !== chapter.id && (
                            <p className="mt-2 text-sm text-red-600">
                              {generateError}
                            </p>
                          )}
                        </section>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Wikipedia modal */}
      {(wikiTopic !== null) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={closeWiki}
        >
          <div
            className="mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-gray-100 animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            {wikiLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
              </div>
            )}

            {wikiError && (
              <div>
                <p className="text-sm text-red-600">{wikiError}</p>
                <p className="mt-2 text-sm text-gray-500">
                  Searched for: <span className="font-medium">{wikiTopic}</span>
                </p>
                <button
                  onClick={closeWiki}
                  className="btn-press mt-4 rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            )}

            {wikiResult && (
              <div>
                <div className="mb-4 flex items-start gap-4">
                  {wikiResult.thumbnail && (
                    <img
                      src={wikiResult.thumbnail}
                      alt={wikiResult.title}
                      className="h-20 w-20 shrink-0 rounded-xl object-cover"
                    />
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {wikiResult.title}
                    </h3>
                    <p className="text-xs text-gray-400">Wikipedia</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-line">
                  {wikiResult.extract}
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <a
                    href={wikiResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-press rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Read full article
                  </a>
                  <button
                    onClick={closeWiki}
                    className="btn-press rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ExamQuestion({ index, q }: { index: number; q: Question }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [questionLang, setQuestionLang] = useState<Language>("en");
  const [answerLang, setAnswerLang] = useState<Language>("en");
  const [qTranslations, setQTranslations] = useState<Translations>(q.question_translations || {});
  const [aTranslations, setATranslations] = useState<Translations>(q.answer_translations || {});

  const displayQuestion = questionLang === "en" ? q.question : (qTranslations[questionLang] || q.question);
  const displayAnswer = answerLang === "en" ? q.suggested_answer : (aTranslations[answerLang] || q.suggested_answer);

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 font-medium text-indigo-900">
          {index}. {displayQuestion}
        </p>
        <TranslateButtons
          questionId={q.id}
          field="question"
          activeLang={questionLang}
          translations={qTranslations}
          colorScheme="indigo"
          onTranslated={(lang, text) => {
            setQuestionLang(lang);
            if (lang !== "en" && text) {
              setQTranslations((prev) => ({ ...prev, [lang]: text }));
            }
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => setShowAnswer(!showAnswer)}
        className="mt-1 rounded-lg px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-100 transition"
      >
        {showAnswer ? "Hide answer" : "Show suggested answer"}
      </button>
      {showAnswer && (
        <div className="mt-2">
          <div className="mb-1 flex justify-end">
            <TranslateButtons
              questionId={q.id}
              field="answer"
              activeLang={answerLang}
              translations={aTranslations}
              colorScheme="indigo"
              onTranslated={(lang, text) => {
                setAnswerLang(lang);
                if (lang !== "en" && text) {
                  setATranslations((prev) => ({ ...prev, [lang]: text }));
                }
              }}
            />
          </div>
          <p className="text-sm text-gray-700">{displayAnswer}</p>
        </div>
      )}
    </div>
  );
}

function DiscussionQuestion({ index, q }: { index: number; q: Question }) {
  const [showWhy, setShowWhy] = useState(false);
  const [questionLang, setQuestionLang] = useState<Language>("en");
  const [answerLang, setAnswerLang] = useState<Language>("en");
  const [qTranslations, setQTranslations] = useState<Translations>(q.question_translations || {});
  const [aTranslations, setATranslations] = useState<Translations>(q.answer_translations || {});

  const displayQuestion = questionLang === "en" ? q.question : (qTranslations[questionLang] || q.question);
  const displayAnswer = answerLang === "en" ? q.suggested_answer : (aTranslations[answerLang] || q.suggested_answer);

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50/80 p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 font-medium text-purple-900">
          {index}. {displayQuestion}
        </p>
        <TranslateButtons
          questionId={q.id}
          field="question"
          activeLang={questionLang}
          translations={qTranslations}
          colorScheme="purple"
          onTranslated={(lang, text) => {
            setQuestionLang(lang);
            if (lang !== "en" && text) {
              setQTranslations((prev) => ({ ...prev, [lang]: text }));
            }
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => setShowWhy(!showWhy)}
        className="mt-1 rounded-lg px-3 py-1.5 text-sm font-medium text-purple-600 hover:bg-purple-100 transition"
      >
        {showWhy ? "Hide" : "Why ask this?"}
      </button>
      {showWhy && (
        <div className="mt-2">
          <div className="mb-1 flex justify-end">
            <TranslateButtons
              questionId={q.id}
              field="answer"
              activeLang={answerLang}
              translations={aTranslations}
              colorScheme="purple"
              onTranslated={(lang, text) => {
                setAnswerLang(lang);
                if (lang !== "en" && text) {
                  setATranslations((prev) => ({ ...prev, [lang]: text }));
                }
              }}
            />
          </div>
          <p className="text-sm text-gray-700">{displayAnswer}</p>
        </div>
      )}
    </div>
  );
}
