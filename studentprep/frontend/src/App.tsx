import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { apiFetch } from "./lib/api";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Course from "./pages/Course";
import StudyPlan from "./pages/StudyPlan";
import Quiz from "./pages/Quiz";
import AdminSettings from "./pages/AdminSettings";
import Pricing from "./pages/Pricing";

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

  return (
    <Routes>
      <Route
        path="/"
        element={user ? <Navigate to="/dashboard" /> : <Landing />}
      />
      <Route
        path="/dashboard"
        element={user ? <Dashboard isAdmin={isAdmin} /> : <Navigate to="/" />}
      />
      <Route
        path="/course/:id"
        element={user ? <Course /> : <Navigate to="/" />}
      />
      <Route
        path="/study-plan/:courseId"
        element={user ? <StudyPlan /> : <Navigate to="/" />}
      />
      <Route
        path="/quiz/:courseId"
        element={user ? <Quiz /> : <Navigate to="/" />}
      />
      <Route
        path="/pricing"
        element={user ? <Pricing /> : <Navigate to="/" />}
      />
      <Route
        path="/admin/settings"
        element={user && isAdmin ? <AdminSettings /> : <Navigate to="/" />}
      />
    </Routes>
  );
}
