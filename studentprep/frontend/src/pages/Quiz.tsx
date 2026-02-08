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
  question_id: string;
  chapter_id: string;
  user_answer: string;
  self_correct: boolean;
  is_review: boolean;
}

export default function Quiz() {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [includesReview, setIncludesReview] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const chapterParam = searchParams.get("chapters");
    if (!courseId || !chapterParam) {
      setError("Missing course or chapter selection");
      setLoading(false);
      return;
    }

    const chapterIds = chapterParam.split(",");

    apiFetch<{
      session_id: string;
      questions: QuizQuestion[];
      includes_review: boolean;
    }>("/api/quiz/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterIds, courseId }),
    })
      .then((data) => {
        setQuestions(data.questions);
        setSessionId(data.session_id);
        setIncludesReview(data.includes_review);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to generate quiz");
        setLoading(false);
      });
  }, [courseId, searchParams]);

  const currentQ = questions[currentIndex];

  const handleSelfAssess = (correct: boolean) => {
    if (!currentQ) return;

    const answer: Answer = {
      question_id: currentQ.id,
      chapter_id: currentQ.chapter_id,
      user_answer: userAnswer,
      self_correct: correct,
      is_review: currentQ.is_review,
    };

    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setUserAnswer("");
      setShowAnswer(false);
    } else {
      // Submit quiz
      submitQuiz(newAnswers);
    }
  };

  const submitQuiz = async (finalAnswers: Answer[]) => {
    try {
      const data = await apiFetch<{ score: number }>("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, answers: finalAnswers }),
      });
      setScore(data.score);
      setSubmitted(true);
    } catch {
      setScore(
        (finalAnswers.filter((a) => a.self_correct).length /
          finalAnswers.length) *
          100
      );
      setSubmitted(true);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error}</p>
        <button
          onClick={() => navigate(`/course/${courseId}`)}
          className="text-indigo-600 hover:underline"
        >
          Back to course
        </button>
      </div>
    );
  }

  if (submitted) {
    const correct = answers.filter((a) => a.self_correct).length;
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b bg-white px-6 py-4">
          <div className="mx-auto max-w-4xl">
            <h1 className="text-xl font-bold text-indigo-600">StudyFlow</h1>
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h2 className="text-3xl font-bold">Quiz Complete!</h2>
          <div className="mt-6 rounded-xl bg-white p-8 shadow-sm">
            <p className="text-6xl font-bold text-indigo-600">
              {Math.round(score || 0)}%
            </p>
            <p className="mt-2 text-gray-500">
              {correct} of {answers.length} correct
            </p>
            {includesReview && (
              <p className="mt-1 text-sm text-purple-600">
                Included spaced repetition questions
              </p>
            )}
          </div>
          <div className="mt-8 flex justify-center gap-4">
            <button
              onClick={() => navigate(`/course/${courseId}`)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              Back to course
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
            >
              Take another quiz
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!currentQ) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">No questions available for these chapters.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <button
            onClick={() => navigate(`/course/${courseId}`)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Exit quiz
          </button>
          <h1 className="text-xl font-bold text-indigo-600">StudyFlow</h1>
          <span className="text-sm text-gray-500">
            {currentIndex + 1} / {questions.length}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        {/* Progress bar */}
        <div className="mb-8 h-2 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all"
            style={{
              width: `${((currentIndex + 1) / questions.length) * 100}%`,
            }}
          />
        </div>

        {/* Question card */}
        <div className="rounded-xl bg-white p-8 shadow-sm">
          {currentQ.is_review && (
            <span className="mb-3 inline-block rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
              Review question
            </span>
          )}

          <h3 className="text-xl font-semibold">{currentQ.question}</h3>

          {!showAnswer ? (
            <div className="mt-6">
              <textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Type your answer..."
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={() => setShowAnswer(true)}
                className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white hover:bg-indigo-700"
              >
                Show answer
              </button>
            </div>
          ) : (
            <div className="mt-6">
              {userAnswer && (
                <div className="mb-4 rounded-lg bg-gray-50 p-4">
                  <p className="text-xs font-medium text-gray-400">
                    Your answer
                  </p>
                  <p className="mt-1 text-gray-700">{userAnswer}</p>
                </div>
              )}

              <div className="rounded-lg bg-green-50 p-4">
                <p className="text-xs font-medium text-green-600">
                  Suggested answer
                </p>
                <p className="mt-1 text-gray-700">
                  {currentQ.suggested_answer}
                </p>
              </div>

              <p className="mt-6 text-center text-sm text-gray-500">
                How did you do?
              </p>
              <div className="mt-2 flex gap-3">
                <button
                  onClick={() => handleSelfAssess(false)}
                  className="flex-1 rounded-lg border-2 border-red-300 bg-red-50 py-3 font-medium text-red-700 hover:bg-red-100"
                >
                  Incorrect
                </button>
                <button
                  onClick={() => handleSelfAssess(true)}
                  className="flex-1 rounded-lg border-2 border-green-300 bg-green-50 py-3 font-medium text-green-700 hover:bg-green-100"
                >
                  Correct
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
