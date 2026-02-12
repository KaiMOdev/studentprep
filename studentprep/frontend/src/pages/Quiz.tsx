import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../lib/api";

interface QuizQuestion {
  id: string;
  chapter_id: string;
  question: string;
  suggested_answer: string;
  is_review: boolean;
}

interface Answer {
  questionId: string;
  userAnswer: string;
  correct: boolean;
}

export default function Quiz() {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const chapters = searchParams.get("chapters");

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [includesReview, setIncludesReview] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  const loadQuiz = async () => {
    if (!courseId || !chapters) return;
    const chapterIds = chapters.split(",");
    try {
      const data = await apiFetch<{
        session_id: string;
        questions: QuizQuestion[];
        includes_review: boolean;
      }>("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterIds, courseId }),
      });
      setSessionId(data.session_id);
      setQuestions(data.questions);
      setIncludesReview(data.includes_review);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate quiz");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!courseId || !chapters) {
      setLoading(false);
      return;
    }
    loadQuiz();
  }, [courseId, chapters]);

  const handleGenerateQuestions = async () => {
    if (!chapters) return;
    setGenerating(true);
    setGenerateError("");
    try {
      const chapterIds = chapters.split(",");
      await Promise.all(
        chapterIds.map((id) =>
          apiFetch(`/api/ai/questions/${id}`, { method: "POST" })
        )
      );
      // Reload the quiz after generating questions
      await loadQuiz();
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to generate questions"
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleShowAnswer = () => {
    setShowAnswer(true);
  };

  const handleSelfAssess = async (correct: boolean) => {
    const newAnswer: Answer = {
      questionId: questions[currentIndex].id,
      userAnswer,
      correct,
    };
    const newAnswers = [...answers, newAnswer];
    setAnswers(newAnswers);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setUserAnswer("");
      setShowAnswer(false);
    } else {
      // Submit quiz
      try {
        const result = await apiFetch<{ score: number }>("/api/quiz/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            answers: newAnswers.map((a) => ({
              questionId: a.questionId,
              userAnswer: a.userAnswer,
              correct: a.correct,
            })),
          }),
        });
        setScore(result.score);
      } catch {
        // Calculate locally if submit fails
        const correctCount = newAnswers.filter((a) => a.correct).length;
        setScore(Math.round((correctCount / newAnswers.length) * 100));
      }
    }
  };

  if (!courseId || !chapters) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50/50">
        <p className="text-red-600">Missing course or chapter selection</p>
        <button
          onClick={() => navigate(`/course/${courseId}`)}
          className="btn-press rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition"
        >
          Back to course
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50/50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50/50">
        <p className="text-red-600">{error}</p>
        <button
          onClick={() => navigate(`/course/${courseId}`)}
          className="btn-press rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition"
        >
          Back to course
        </button>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50/50">
        <p className="text-gray-600">No questions available for the selected chapters</p>
        <button
          onClick={handleGenerateQuestions}
          disabled={generating}
          className="btn-press rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
        >
          {generating ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Generating...
            </span>
          ) : (
            "Generate Questions"
          )}
        </button>
        {generateError && (
          <p className="text-sm text-red-600">{generateError}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/course/${courseId}`)}
            className="btn-press rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            Back to course
          </button>
          <button
            onClick={() => navigate(`/study-plan/${courseId}`)}
            className="btn-press rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            Back to study plan
          </button>
        </div>
      </div>
    );
  }

  // Results screen
  if (score !== null) {
    const correctCount = answers.filter((a) => a.correct).length;
    const scoreColor = score >= 70 ? "text-green-600" : score >= 50 ? "text-yellow-600" : "text-red-600";
    const scoreBg = score >= 70 ? "bg-green-50 ring-green-200" : score >= 50 ? "bg-yellow-50 ring-yellow-200" : "bg-red-50 ring-red-200";

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50/50 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl ring-1 ring-gray-100 animate-fade-in-up">
          <h2 className="mb-4 text-2xl font-extrabold">Quiz Complete!</h2>
          <div className={`mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full ring-4 ${scoreBg}`}>
            <span className={`text-4xl font-extrabold ${scoreColor}`}>{score}%</span>
          </div>
          <p className="mb-2 text-gray-600">
            {correctCount} of {questions.length} correct
          </p>
          {includesReview && (
            <p className="mb-4 text-sm text-gray-400">
              Included spaced repetition questions
            </p>
          )}
          <div className="flex justify-center gap-3">
            <button
              onClick={() => navigate(`/course/${courseId}`)}
              className="btn-press rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700 transition shadow-sm"
            >
              Back to course
            </button>
            <button
              onClick={() => window.location.reload()}
              className="btn-press rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-2.5 font-semibold text-indigo-700 hover:bg-indigo-100 transition"
            >
              Take another quiz
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active question
  const q = questions[currentIndex];

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <header className="glass-header sticky top-0 z-30 border-b border-gray-200/60 px-6 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <button
            onClick={() => navigate(`/course/${courseId}`)}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Exit quiz
          </button>
          <span className="text-sm font-semibold text-gray-400">
            {currentIndex + 1} / {questions.length}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* Progress bar */}
        <div className="mb-6 h-2 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-300"
            style={{
              width: `${((currentIndex + 1) / questions.length) * 100}%`,
            }}
          />
        </div>

        {/* Question card */}
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100 animate-fade-in-up">
          {q.is_review && (
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              Review question
            </span>
          )}

          <h3 className="mb-6 text-xl font-bold">{q.question}</h3>

          {!showAnswer ? (
            <>
              <textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Type your answer..."
                className="mb-4 w-full rounded-xl border border-gray-200 p-4 text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                rows={3}
              />
              <button
                onClick={handleShowAnswer}
                className="btn-press rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700 transition shadow-sm shadow-indigo-200"
              >
                Show answer
              </button>
            </>
          ) : (
            <>
              {/* User's answer */}
              {userAnswer && (
                <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="mb-1 text-xs font-medium text-gray-400">Your answer</p>
                  <p className="text-sm text-gray-700">{userAnswer}</p>
                </div>
              )}

              {/* Suggested answer */}
              <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                <p className="mb-1 text-xs font-medium text-indigo-400">Suggested answer</p>
                <p className="text-sm text-indigo-900">{q.suggested_answer}</p>
              </div>

              {/* Self-assessment buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => handleSelfAssess(true)}
                  className="btn-press flex-1 rounded-xl bg-green-600 px-4 py-2.5 font-semibold text-white hover:bg-green-700 transition"
                >
                  Correct
                </button>
                <button
                  onClick={() => handleSelfAssess(false)}
                  className="btn-press flex-1 rounded-xl bg-red-600 px-4 py-2.5 font-semibold text-white hover:bg-red-700 transition"
                >
                  Incorrect
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
