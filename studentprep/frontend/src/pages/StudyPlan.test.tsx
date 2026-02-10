import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudyPlan from "./StudyPlan";
import { apiFetch } from "../lib/api";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderStudyPlan(courseId = "course-1") {
  return render(
    <MemoryRouter initialEntries={[`/study-plan/${courseId}`]}>
      <Routes>
        <Route path="/study-plan/:courseId" element={<StudyPlan />} />
      </Routes>
    </MemoryRouter>
  );
}

const mockPlan = {
  id: "plan-1",
  exam_date: "2025-06-15",
  created_at: "2025-01-20T10:00:00Z",
  plan: [
    {
      date: "2025-06-10",
      chapters: [{ id: "ch1", title: "Introduction" }],
      total_minutes: 180,
      type: "study" as const,
    },
    {
      date: "2025-06-11",
      chapters: [{ id: "ch2", title: "Advanced Topics" }],
      total_minutes: 120,
      type: "review" as const,
    },
    {
      date: "2025-06-12",
      chapters: [],
      total_minutes: 60,
      type: "buffer" as const,
    },
  ],
};

const mockPlan2 = {
  id: "plan-2",
  exam_date: "2025-07-01",
  created_at: "2025-02-01T10:00:00Z",
  plan: [
    {
      date: "2025-06-28",
      chapters: [{ id: "ch1", title: "Basics" }],
      total_minutes: 90,
      type: "study" as const,
    },
  ],
};

describe("StudyPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));
    renderStudyPlan();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows empty state when no plans exist", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ plans: [] });
    renderStudyPlan();

    expect(await screen.findByText("No study plans yet.")).toBeInTheDocument();
    expect(
      screen.getByText('Click "New plan" to generate your first study schedule.')
    ).toBeInTheDocument();
  });

  it("renders header with back button", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ plans: [] });
    const user = userEvent.setup();
    renderStudyPlan();

    await screen.findByText("Study Plans");

    await user.click(screen.getByText(/Back to course/));
    expect(mockNavigate).toHaveBeenCalledWith("/course/course-1");
  });

  it("renders plan with day schedule", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ plans: [mockPlan] });
    renderStudyPlan();

    await waitFor(() => {
      expect(screen.getByText("Introduction")).toBeInTheDocument();
    });

    expect(screen.getByText("Advanced Topics")).toBeInTheDocument();
  });

  it("shows day type labels in schedule", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ plans: [mockPlan] });
    renderStudyPlan();

    await waitFor(() => {
      expect(screen.getByText("Introduction")).toBeInTheDocument();
    });

    // The type labels appear both in the legend and in each day row
    const studyLabels = screen.getAllByText("Study");
    const reviewLabels = screen.getAllByText("Review");
    const bufferLabels = screen.getAllByText("Buffer");
    expect(studyLabels.length).toBeGreaterThanOrEqual(1);
    expect(reviewLabels.length).toBeGreaterThanOrEqual(1);
    expect(bufferLabels.length).toBeGreaterThanOrEqual(1);
  });

  it("shows time duration for each day", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ plans: [mockPlan] });
    renderStudyPlan();

    await waitFor(() => {
      expect(screen.getByText("Introduction")).toBeInTheDocument();
    });

    // Check the rendered time text (e.g. "3h ", "2h ", "1h ")
    const timeElements = document.querySelectorAll(".text-xs.text-gray-500");
    const timeTexts = Array.from(timeElements).map((el) => el.textContent);
    expect(timeTexts.some((t) => t?.includes("3h"))).toBe(true);
    expect(timeTexts.some((t) => t?.includes("2h"))).toBe(true);
    expect(timeTexts.some((t) => t?.includes("1h"))).toBe(true);
  });

  it("shows New plan button that toggles form", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ plans: [] });
    const user = userEvent.setup();
    renderStudyPlan();

    const newPlanButton = await screen.findByText("New plan");
    await user.click(newPlanButton);

    expect(
      screen.getByText("Generate a new study schedule")
    ).toBeInTheDocument();
    expect(screen.getByText("Exam date")).toBeInTheDocument();
    expect(screen.getByText("Hours per day")).toBeInTheDocument();
    expect(screen.getByText("Generate plan")).toBeInTheDocument();

    // Toggle cancel
    await user.click(screen.getByText("Cancel"));
    expect(
      screen.queryByText("Generate a new study schedule")
    ).not.toBeInTheDocument();
  });

  it("submits form to create a new plan", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.startsWith("/api/ai/study-plans/")) return { plans: [] };
      if (url === "/api/ai/study-plan" && options?.method === "POST") {
        return { plan: mockPlan };
      }
      return {};
    });

    const user = userEvent.setup();
    renderStudyPlan();

    await user.click(await screen.findByText("New plan"));

    // Use fireEvent.change for date input (userEvent.type doesn't work well with date inputs in jsdom)
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2027-06-15" } });

    await user.click(screen.getByText("Generate plan"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/ai/study-plan",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("shows generating state while creating plan", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.startsWith("/api/ai/study-plans/")) return { plans: [] };
      if (url === "/api/ai/study-plan" && options?.method === "POST") {
        return new Promise(() => {}); // Hang
      }
      return {};
    });

    const user = userEvent.setup();
    renderStudyPlan();

    await user.click(await screen.findByText("New plan"));

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2027-06-15" } });

    await user.click(screen.getByText("Generate plan"));

    expect(await screen.findByText("Generating...")).toBeInTheDocument();
  });

  it("shows error when plan generation fails", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.startsWith("/api/ai/study-plans/")) return { plans: [] };
      if (url === "/api/ai/study-plan" && options?.method === "POST") {
        throw new Error("AI service unavailable");
      }
      return {};
    });

    const user = userEvent.setup();
    renderStudyPlan();

    await user.click(await screen.findByText("New plan"));

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2027-06-15" } });

    await user.click(screen.getByText("Generate plan"));

    expect(await screen.findByText("AI service unavailable")).toBeInTheDocument();
  });

  it("shows plan selector when multiple plans exist", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ plans: [mockPlan, mockPlan2] });
    renderStudyPlan();

    // The plan selector buttons contain "Exam: <date>" and the active plan detail also shows "Exam: <long date>"
    // We look for the selector buttons specifically which are in a flex-wrap container
    await waitFor(() => {
      // Both plan selector buttons plus the active plan detail
      const examTexts = screen.getAllByText(/Exam/);
      expect(examTexts.length).toBeGreaterThanOrEqual(3);
    });
  });

  it("shows delete and regenerate buttons", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ plans: [mockPlan] });
    renderStudyPlan();

    expect(await screen.findByText("Regenerate")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("deletes a plan after confirmation", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.startsWith("/api/ai/study-plans/")) return { plans: [mockPlan] };
      if (url === "/api/ai/study-plan/plan-1" && options?.method === "DELETE") return {};
      return {};
    });

    window.confirm = vi.fn().mockReturnValue(true);

    const user = userEvent.setup();
    renderStudyPlan();

    await user.click(await screen.findByText("Delete"));

    expect(window.confirm).toHaveBeenCalledWith("Delete this study plan?");
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/ai/study-plan/plan-1", {
        method: "DELETE",
      });
    });
  });

  it("expands day row on click to show full text and quiz button", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ plans: [mockPlan] });
    const user = userEvent.setup();
    renderStudyPlan();

    const introText = await screen.findByText("Introduction");

    // Click the day row
    await user.click(introText);

    // Quiz button should appear
    expect(screen.getByText(/Start quiz for/)).toBeInTheDocument();
  });

  it("collapses day row when clicked again", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ plans: [mockPlan] });
    const user = userEvent.setup();
    renderStudyPlan();

    const introText = await screen.findByText("Introduction");

    // Click to expand
    await user.click(introText);
    expect(screen.getByText(/Start quiz for/)).toBeInTheDocument();

    // Click again to collapse
    await user.click(introText);
    expect(screen.queryByText(/Start quiz for/)).not.toBeInTheDocument();
  });

  it("navigates to quiz when quiz button is clicked", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ plans: [mockPlan] });
    const user = userEvent.setup();
    renderStudyPlan();

    const introText = await screen.findByText("Introduction");
    await user.click(introText);

    await user.click(screen.getByText(/Start quiz for/));
    expect(mockNavigate).toHaveBeenCalledWith("/quiz/course-1?chapters=ch1");
  });

  it("shows error when loading plans fails", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Network error"));
    renderStudyPlan();

    expect(await screen.findByText("Failed to load study plans")).toBeInTheDocument();
  });
});
