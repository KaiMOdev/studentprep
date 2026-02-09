import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./Dashboard";
import { apiFetch, apiUpload } from "../lib/api";
import { supabase } from "../lib/supabase";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

const mockCourses = [
  { id: "c1", title: "Biology 101", original_filename: "bio.pdf", status: "ready", created_at: "2025-01-15T10:00:00Z" },
  { id: "c2", title: "History 201", original_filename: "hist.pdf", status: "processing", created_at: "2025-01-16T10:00:00Z" },
  { id: "c3", title: "Math 301", original_filename: "math.pdf", status: "uploaded", created_at: "2025-01-17T10:00:00Z" },
];

const mockPlans = [
  { id: "p1", exam_date: "2025-06-15", created_at: "2025-01-20T10:00:00Z", course_id: "c1" },
];

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === "/api/courses") return { courses: [] };
      if (url.startsWith("/api/ai/study-plans/")) return { plans: [] };
      return {};
    });
  });

  it("renders header with user email and sign-out button", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("StudyFlow")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("shows empty state when no courses exist", async () => {
    renderDashboard();
    expect(
      await screen.findByText("No courses yet. Upload your first PDF!")
    ).toBeInTheDocument();
  });

  it("renders course list with status labels", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === "/api/courses") return { courses: mockCourses };
      if (url.startsWith("/api/ai/study-plans/")) return { plans: [] };
      return {};
    });

    renderDashboard();

    expect(await screen.findByText("Biology 101")).toBeInTheDocument();
    expect(screen.getByText("History 201")).toBeInTheDocument();
    expect(screen.getByText("Math 301")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Processing...")).toBeInTheDocument();
    expect(screen.getByText("Uploaded")).toBeInTheDocument();
  });

  it("shows Upload PDF button", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Upload PDF")).toBeInTheDocument();
    });
  });

  it("navigates to course page when course is clicked", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === "/api/courses") return { courses: mockCourses };
      if (url.startsWith("/api/ai/study-plans/")) return { plans: [] };
      return {};
    });

    const user = userEvent.setup();
    renderDashboard();

    const courseButton = await screen.findByText("Biology 101");
    await user.click(courseButton);

    expect(mockNavigate).toHaveBeenCalledWith("/course/c1");
  });

  it("calls signOut when sign out button is clicked", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it("shows study plan info for courses with plans", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === "/api/courses") return { courses: mockCourses };
      if (url === "/api/ai/study-plans/c1") return { plans: mockPlans };
      if (url.startsWith("/api/ai/study-plans/")) return { plans: [] };
      return {};
    });

    renderDashboard();

    expect(await screen.findByText("View plan")).toBeInTheDocument();
  });

  it("shows 'Create a study plan' for ready courses without plans", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === "/api/courses") return { courses: mockCourses };
      if (url.startsWith("/api/ai/study-plans/")) return { plans: [] };
      return {};
    });

    renderDashboard();

    expect(await screen.findByText("Create a study plan")).toBeInTheDocument();
  });

  it("handles upload and reloads courses", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === "/api/courses") return { courses: [] };
      return {};
    });
    vi.mocked(apiUpload).mockResolvedValueOnce({});

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Upload PDF")).toBeInTheDocument();
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["pdf content"], "test.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(apiUpload).toHaveBeenCalledWith(
        "/api/courses/upload",
        expect.any(FormData)
      );
    });
  });

  it("shows error when upload fails", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === "/api/courses") return { courses: [] };
      return {};
    });
    vi.mocked(apiUpload).mockRejectedValueOnce(new Error("Upload failed"));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Upload PDF")).toBeInTheDocument();
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["pdf content"], "test.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText("Upload failed")).toBeInTheDocument();
  });

  it("deletes a course after confirmation", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "/api/courses" && !options?.method) return { courses: mockCourses };
      if (url === "/api/courses/c1" && options?.method === "DELETE") return {};
      if (url.startsWith("/api/ai/study-plans/")) return { plans: [] };
      return {};
    });

    window.confirm = vi.fn().mockReturnValue(true);

    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText("Biology 101");

    const deleteButtons = screen.getAllByTitle("Delete course");
    await user.click(deleteButtons[0]);

    expect(window.confirm).toHaveBeenCalledWith(
      'Delete "Biology 101"? This will remove the course and all its data permanently.'
    );

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/courses/c1", { method: "DELETE" });
    });
  });

  it("does not delete when confirmation is cancelled", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === "/api/courses") return { courses: mockCourses };
      if (url.startsWith("/api/ai/study-plans/")) return { plans: [] };
      return {};
    });

    window.confirm = vi.fn().mockReturnValue(false);

    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText("Biology 101");

    const deleteButtons = screen.getAllByTitle("Delete course");
    await user.click(deleteButtons[0]);

    expect(apiFetch).not.toHaveBeenCalledWith("/api/courses/c1", { method: "DELETE" });
  });
});
