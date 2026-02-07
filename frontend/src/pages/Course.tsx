import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

interface MainTopic {
  topic: string;
  explanation: string;
  key_terms: string[];
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

interface Question {
  id: string;
  chapter_id: string;
  type: "exam" | "discussion";
  question: string;
  suggested_answer: string;
}

interface CourseData {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

export default function Course() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<CourseData | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

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

  // Poll while processing
  useEffect(() => {
    if (course?.status !== "processing") return;
    const interval = setInterval(loadCourse, 5000);
    return () => clearInterval(interval);
  }, [course?.status, loadCourse]);

  const startProcessing = async () => {
    if (!id) return;
    setProcessing(true);
    setError("");
    try {
      await apiFetch(`/api/ai/summarize/${id}`, { method: "POST" });
      await loadCourse();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setProcessing(false);
    }
  };

  const getChapterQuestions = (chapterId: string) =>
    questions.filter((q) => q.chapter_id === chapterId);

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
              PDF uploaded. Ready to process with AI?
            </p>
            <button
              onClick={startProcessing}
              disabled={processing}
              className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {processing ? "Starting..." : "Summarize with AI"}
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="mb-8 rounded-xl bg-blue-50 p-8 text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            <p className="text-lg text-blue-700">
              Processing your course... This may take a few minutes.
            </p>
            <p className="mt-2 text-sm text-blue-500">
              Extracting text, detecting chapters, summarizing, generating
              questions...
            </p>
          </div>
        )}

        {course.status === "error" && (
          <div className="mb-8 rounded-xl bg-red-50 p-8 text-center">
            <p className="text-lg text-red-700">
              Something went wrong while processing.
            </p>
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
        {isReady && chapters.length > 0 && (
          <div className="mb-8 flex flex-wrap gap-3">
            <button
              onClick={() => navigate(`/study-plan/${id}`)}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700"
            >
              Create Study Plan
            </button>
            <button
              onClick={() =>
                navigate(
                  `/quiz/${id}?chapters=${chapters.map((c) => c.id).join(",")}`
                )
              }
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-5 py-2.5 font-medium text-indigo-700 hover:bg-indigo-100"
            >
              Start Quiz (all chapters)
            </button>
          </div>
        )}

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
                                        {topic.key_terms.map((term, j) => (
                                          <span
                                            key={j}
                                            className="rounded bg-yellow-200 px-2 py-0.5 text-xs font-medium text-yellow-800"
                                          >
                                            {term}
                                          </span>
                                        ))}
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

function ExamQuestion({ index, q }: { index: number; q: Question }) {
  const [showAnswer, setShowAnswer] = useState(false);
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <p className="font-medium text-indigo-900">
        {index}. {q.question}
      </p>
      <button
        onClick={() => setShowAnswer(!showAnswer)}
        className="mt-2 text-sm font-medium text-indigo-600 hover:underline"
      >
        {showAnswer ? "Hide answer" : "Show suggested answer"}
      </button>
      {showAnswer && (
        <p className="mt-2 text-sm text-gray-700">{q.suggested_answer}</p>
      )}
    </div>
  );
}

function DiscussionQuestion({ index, q }: { index: number; q: Question }) {
  const [showWhy, setShowWhy] = useState(false);
  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
      <p className="font-medium text-purple-900">
        {index}. {q.question}
      </p>
      <button
        onClick={() => setShowWhy(!showWhy)}
        className="mt-2 text-sm font-medium text-purple-600 hover:underline"
      >
        {showWhy ? "Hide" : "Why ask this?"}
      </button>
      {showWhy && (
        <p className="mt-2 text-sm text-gray-700">{q.suggested_answer}</p>
      )}
    </div>
  );
}
