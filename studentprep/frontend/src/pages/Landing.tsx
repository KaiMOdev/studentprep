import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

export default function Landing() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = isSignUp
      ? await signUpWithEmail(email, password)
      : await signInWithEmail(email, password);

    if (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel — brand story */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 p-12 text-white">
        <div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-xl font-extrabold">SF</div>
          <p className="mt-2 text-indigo-200 text-sm font-medium">AI-powered learning</p>
        </div>

        <div className="space-y-6">
          {[
            { icon: uploadIcon, title: "Upload your course PDF", desc: "Drop any textbook or syllabus and we handle the rest." },
            { icon: aiIcon, title: "AI summarizes & creates questions", desc: "Get chapter summaries, key terms, exam prep, and discussion prompts." },
            { icon: planIcon, title: "Study smarter with a plan", desc: "Personalized study schedules, quizzes, and spaced repetition." },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                {item.icon}
              </div>
              <div>
                <p className="font-semibold">{item.title}</p>
                <p className="mt-0.5 text-sm text-indigo-200">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-indigo-300">
          Trusted by students preparing for exams worldwide.
        </p>
      </div>

      {/* Right panel — auth card */}
      <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-white px-4 py-12">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="mb-8 text-center lg:mb-10">
            <h1 className="text-4xl font-extrabold tracking-tight text-indigo-600">StudyFlow</h1>
            <p className="mt-2 text-lg text-gray-600">
              Upload your course, let AI do the work.
            </p>
          </div>

          {/* Auth card */}
          <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-gray-100">
            <h2 className="mb-6 text-center text-lg font-bold text-gray-900">
              {isSignUp ? "Create your account" : "Welcome back"}
            </h2>

            {/* Google SSO */}
            <button
              onClick={signInWithGoogle}
              className="btn-press flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 font-medium text-gray-700 transition hover:bg-gray-50 hover:border-gray-300"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>

            {/* Divider */}
            <div className="my-6 flex items-center gap-4">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            {/* Email form with floating labels */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="floating-label-group focus-glow rounded-xl">
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <label>Email address</label>
              </div>
              <div className="floating-label-group focus-glow rounded-xl">
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <label>Password</label>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-press w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading
                  ? "Please wait..."
                  : isSignUp
                    ? "Create account"
                    : "Sign in"}
              </button>
            </form>

            {/* Toggle link */}
            <p className="mt-4 text-center text-sm text-gray-500">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError("");
                }}
                className="font-medium text-indigo-600 hover:underline"
              >
                {isSignUp ? "Sign in" : "Sign up"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Inline SVG icons for brand panel ── */
const uploadIcon = (
  <svg className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
  </svg>
);

const aiIcon = (
  <svg className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
    <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
  </svg>
);

const planIcon = (
  <svg className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
  </svg>
);
