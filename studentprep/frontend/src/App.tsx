import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { apiFetch } from "./lib/api";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Course from "./pages/Course";
import StudyPlan from "./pages/StudyPlan";
import Quiz from "./pages/Quiz";
import AdminSettings from "./pages/AdminSettings";

export default function App() {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }

    apiFetch<{ user: { isAdmin: boolean } }>("/api/auth/me")
      .then((data) => setIsAdmin(data.user.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    );
  }

  return (
    <SubscriptionProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route
          path="/dashboard"
          element={<Dashboard isAdmin={isAdmin} />}
        />
        <Route path="/course/:id" element={<Course />} />
        <Route path="/study-plan/:courseId" element={<StudyPlan />} />
        <Route path="/quiz/:courseId" element={<Quiz />} />
        <Route
          path="/admin/settings"
          element={isAdmin ? <AdminSettings /> : <Navigate to="/" />}
        />
      </Routes>
    </SubscriptionProvider>
  );
}
