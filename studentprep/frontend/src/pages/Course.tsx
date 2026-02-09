import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

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

type Language = "en" | "nl" | "fr";
type TranslateLang = "nl" | "fr";

const TRANSLATE_OPTIONS: { lang: TranslateLang; label: string; flag: string }[] = [
  { lang: "nl", label: "NL", flag: "🇳🇱" },
  { lang: "fr", label: "FR", flag: "🇫🇷" },
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
    // If clicking the already active language, go back to original
    if (activeLang === targetLang) {
      onTranslated("en", "");
      return;
    }

    // If translation is already cached, use it
    if (translations?.[targetLang]) {
      onTranslated(targetLang, translations[targetLang]!);
      return;
    }

    // Call API for on-demand translation
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
        className={`rounded-l-md border px-2 py-0.5 text-xs font-medium transition ${
          activeLang === "en" ? colors.originalActive : colors.original
        }`}
      >
        Original
      </button>
      {TRANSLATE_OPTIONS.map((opt) => (
        <button
          key={opt.lang}
          onClick={() => handleTranslate(opt.lang)}
          disabled={loading !== null}
          className={`border px-2 py-0.5 text-xs font-medium transition last:rounded-r-md ${
            activeLang === opt.lang ? colors.active : colors.inactive
          } disabled:opacity-50`}
        >
          {loading === opt.lang ? (
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {opt.label}
            </span>
          ) : (
            `${opt.flag} ${opt.label}`
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
  step: "extracting" | "detecting" | "processing_chapter" | "generating_questions" | "done" | "unknown";
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

export default function Course() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<CourseData | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
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

  // Fetch available AI models
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
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setProcessing(false);
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
      setGenerateError(
        err instanceof Error ? err.message : "Failed to generate questions"
      );
    } finally {
      setGeneratingQuestions(null);
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
      setSummarizeError(
        err instanceof Error ? err.message : "Failed to summarize chapter"
      );
    } finally {
      setSummarizingChapter(null);
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

  if (!course) {
    return (
      <div className="flex min-h-screen items-center justify-center">
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
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to courses
          </button>
          <h1 className="text-xl font-bold text-indigo-600">StudyFlow</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {/* Course header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold">{course.title}</h2>
          <p className="mt-1 text-sm text-gray-500">
            Uploaded {new Date(course.created_at).toLocaleDateString("en-GB")}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Status + action */}
        {isUploaded && (
          <div className="mb-8 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 p-8 text-center">
            <p className="mb-4 text-lg text-gray-700">
              PDF uploaded. Extract chapters with AI?
            </p>
            <div className="mb-4 flex items-center justify-center gap-3">
              <label className="text-sm font-medium text-gray-600">
                Model:
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={processing}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
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
              className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {processing ? "Starting..." : "Extract Chapters"}
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="mb-8 rounded-xl bg-blue-50 p-8">
            {/* Step label */}
            <div className="mb-3 flex items-center justify-center gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-blue-500 border-t-transparent" />
              <p className="text-lg font-medium text-blue-700">
                {!progress || progress.step === "unknown"
                  ? "Starting..."
                  : progress.step === "extracting"
                    ? "Extracting text from PDF..."
                    : progress.step === "detecting"
                      ? "Detecting chapters..."
                      : progress.step === "processing_chapter"
                        ? `Saving chapter ${progress.currentChapter} of ${progress.totalChapters}`
                        : progress.step === "generating_questions"
                          ? `Generating questions for chapter ${progress.currentChapter} of ${progress.totalChapters}`
                          : "Finishing up..."}
              </p>
            </div>

            {/* Chapter title */}
            {(progress?.step === "processing_chapter" || progress?.step === "generating_questions") && progress.chapterTitle && (
              <p className="mb-4 text-center text-sm text-blue-600 truncate">
                {progress.chapterTitle}
              </p>
            )}

            {/* Progress bar */}
            {progress && progress.totalChapters > 0 ? (
              <div className="mx-auto max-w-md">
                <div className="mb-2 h-3 overflow-hidden rounded-full bg-blue-200">
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
                <div className="mb-2 h-3 overflow-hidden rounded-full bg-blue-200">
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
                className="rounded-lg border border-red-300 bg-white px-5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {cancelling ? "Stopping..." : "Stop processing"}
              </button>
            </div>
          </div>
        )}

        {course.status === "error" && (
          <div className="mb-8 rounded-xl bg-red-50 p-8 text-center">
            <p className="text-lg text-red-700">
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
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
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
              className="mt-4 rounded-lg bg-red-600 px-6 py-3 font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
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
                className="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700"
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
                  className="rounded-lg border border-indigo-300 bg-indigo-50 px-5 py-2.5 font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  Start Quiz ({chaptersWithQuestions.length === chapters.length
                    ? "all chapters"
                    : `${chaptersWithQuestions.length} of ${chapters.length} chapters`})
                </button>
              ) : (
                <span className="rounded-lg border border-gray-300 bg-gray-50 px-5 py-2.5 text-sm text-gray-400">
                  No chapters have questions yet
                </span>
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
                  className="overflow-hidden rounded-lg bg-white shadow-sm"
                >
                  {/* Chapter header */}
                  <button
                    onClick={() =>
                      setExpandedChapter(isExpanded ? null : chapter.id)
                    }
                    className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-gray-50"
                  >
                    <h3 className="text-lg font-semibold">
                      {chapter.sort_order + 1}. {chapter.title}
                    </h3>
                    <span className="text-2xl text-gray-400">
                      {isExpanded ? "\u2212" : "+"}
                    </span>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t px-6 py-6 space-y-8">
                      {/* Summarize button when no summary exists */}
                      {(!chapter.summary_main || chapter.summary_main.length === 0) && (
                        <section className="rounded-lg border-2 border-dashed border-yellow-300 bg-yellow-50 p-6 text-center">
                          <p className="text-gray-600 mb-3">
                            This chapter has not been summarized yet.
                          </p>
                          <button
                            onClick={() => summarizeChapterById(chapter.id)}
                            disabled={summarizingChapter === chapter.id}
                            className="rounded-lg bg-yellow-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-yellow-600 disabled:opacity-50"
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
                                  className="rounded-lg border-l-4 border-yellow-400 bg-yellow-50 p-4"
                                >
                                  <p className="font-medium">{topic.topic}</p>
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
                                              key={j}
                                              title={tooltip ? `${tooltip} (click for Wikipedia)` : "Click for Wikipedia"}
                                              onClick={() => lookupWiki(chapter.id, label)}
                                              className="rounded bg-yellow-200 px-2 py-0.5 text-xs font-medium text-yellow-800 hover:bg-yellow-300 hover:underline cursor-pointer transition"
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
                                  className="rounded-lg border-l-4 border-green-400 bg-green-50 p-4"
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
                        <section className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                          <p className="text-gray-500">
                            No questions available for this chapter.
                          </p>
                          <button
                            onClick={() =>
                              generateChapterQuestions(chapter.id)
                            }
                            disabled={generatingQuestions === chapter.id}
                            className="mt-3 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
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
            className="mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
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
                  className="mt-4 rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
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
                      className="h-20 w-20 shrink-0 rounded-lg object-cover"
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
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Read full article
                  </a>
                  <button
                    onClick={closeWiki}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
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
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="font-medium text-indigo-900">
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
        onClick={() => setShowAnswer(!showAnswer)}
        className="mt-1 text-sm font-medium text-indigo-600 hover:underline"
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
    <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="font-medium text-purple-900">
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
        onClick={() => setShowWhy(!showWhy)}
        className="mt-1 text-sm font-medium text-purple-600 hover:underline"
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
