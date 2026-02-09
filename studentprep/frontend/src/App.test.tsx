import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { supabase } from "./lib/supabase";

// We need to mock useAuth at the hook level to control user state
vi.mock("./hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "./hooks/useAuth";

// Mock page components to keep tests focused on routing
vi.mock("./pages/Landing", () => ({
  default: () => <div data-testid="landing-page">Landing Page</div>,
}));
vi.mock("./pages/Dashboard", () => ({
  default: () => <div data-testid="dashboard-page">Dashboard Page</div>,
}));
vi.mock("./pages/Course", () => ({
  default: () => <div data-testid="course-page">Course Page</div>,
}));
vi.mock("./pages/StudyPlan", () => ({
  default: () => <div data-testid="study-plan-page">Study Plan Page</div>,
}));
vi.mock("./pages/Quiz", () => ({
  default: () => <div data-testid="quiz-page">Quiz Page</div>,
}));

function renderApp(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  );
}

describe("App routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when loading", () => {
    it("shows loading spinner", () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        session: null,
        loading: true,
        signInWithGoogle: vi.fn(),
        signInWithEmail: vi.fn(),
        signUpWithEmail: vi.fn(),
        signOut: vi.fn(),
      });

      renderApp();
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });
  });

  describe("when not authenticated", () => {
    beforeEach(() => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        session: null,
        loading: false,
        signInWithGoogle: vi.fn(),
        signInWithEmail: vi.fn(),
        signUpWithEmail: vi.fn(),
        signOut: vi.fn(),
      });
    });

    it("shows landing page at /", () => {
      renderApp("/");
      expect(screen.getByTestId("landing-page")).toBeInTheDocument();
    });

    it("redirects /dashboard to /", () => {
      renderApp("/dashboard");
      expect(screen.getByTestId("landing-page")).toBeInTheDocument();
    });

    it("redirects /course/:id to /", () => {
      renderApp("/course/123");
      expect(screen.getByTestId("landing-page")).toBeInTheDocument();
    });

    it("redirects /study-plan/:courseId to /", () => {
      renderApp("/study-plan/123");
      expect(screen.getByTestId("landing-page")).toBeInTheDocument();
    });

    it("redirects /quiz/:courseId to /", () => {
      renderApp("/quiz/123?chapters=ch1");
      expect(screen.getByTestId("landing-page")).toBeInTheDocument();
    });
  });

  describe("when authenticated", () => {
    beforeEach(() => {
      vi.mocked(useAuth).mockReturnValue({
        user: { id: "user-1", email: "test@example.com" } as never,
        session: {} as never,
        loading: false,
        signInWithGoogle: vi.fn(),
        signInWithEmail: vi.fn(),
        signUpWithEmail: vi.fn(),
        signOut: vi.fn(),
      });
    });

    it("redirects / to /dashboard", () => {
      renderApp("/");
      expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    });

    it("shows dashboard at /dashboard", () => {
      renderApp("/dashboard");
      expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
    });

    it("shows course page at /course/:id", () => {
      renderApp("/course/123");
      expect(screen.getByTestId("course-page")).toBeInTheDocument();
    });

    it("shows study plan page at /study-plan/:courseId", () => {
      renderApp("/study-plan/123");
      expect(screen.getByTestId("study-plan-page")).toBeInTheDocument();
    });

    it("shows quiz page at /quiz/:courseId", () => {
      renderApp("/quiz/123?chapters=ch1");
      expect(screen.getByTestId("quiz-page")).toBeInTheDocument();
    });
  });
});
