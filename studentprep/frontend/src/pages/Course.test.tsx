import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Course from "./Course";
import { apiFetch } from "../lib/api";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderCourse(id = "course-1") {
  return render(
    <MemoryRouter initialEntries={[`/course/${id}`]}>
      <Routes>
        <Route path="/course/:id" element={<Course />} />
      </Routes>
    </MemoryRouter>
  );
}

const readyCourse = {
  course: {
    id: "course-1",
    title: "Biology 101",
    status: "ready",
    created_at: "2025-01-15T10:00:00Z",
  },
  chapters: [
    {
      id: "ch1",
      title: "Introduction to Cells",
      summary_main: [
        {
          topic: "Cell Structure",
          explanation: "Cells are the basic unit of life.",
          key_terms: [
            { term: "Nucleus", definition: "Center of the cell" },
            "Membrane",
          ],
        },
      ],
      summary_side: [
        {
          topic: "History of Microscopy",
          explanation: "The microscope enabled cell discovery.",
        },
      ],
      sort_order: 0,
    },
    {
      id: "ch2",
      title: "Genetics",
      summary_main: [
        {
          topic: "DNA",
          explanation: "DNA carries genetic information.",
          key_terms: [],
        },
      ],
      summary_side: null,
      sort_order: 1,
    },
  ],
  questions: [
    {
      id: "q1",
      chapter_id: "ch1",
      type: "exam",
      question: "What is the nucleus?",
      suggested_answer: "The nucleus is the cell's control center.",
      question_translations: {},
      answer_translations: {},
    },
    {
      id: "q2",
      chapter_id: "ch1",
      type: "discussion",
      question: "Why are cells important?",
      suggested_answer: "Cells are the building blocks of all life.",
      question_translations: {},
      answer_translations: {},
    },
  ],
};

const uploadedCourse = {
  course: {
    id: "course-1",
    title: "New Course",
    status: "uploaded",
    created_at: "2025-01-15T10:00:00Z",
  },
  chapters: [],
  questions: [],
};

const processingCourse = {
  course: {
    id: "course-1",
    title: "Processing Course",
    status: "processing",
    created_at: "2025-01-15T10:00:00Z",
  },
  chapters: [],
  questions: [],
};

const errorCourse = {
  course: {
    id: "course-1",
    title: "Error Course",
    status: "error",
    created_at: "2025-01-15T10:00:00Z",
  },
  chapters: [],
  questions: [],
};

describe("Course", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === "/api/courses/course-1") return readyCourse;
      if (url === "/api/ai/models") {
        return {
          models: [
            { id: "claude-sonnet-4-5-20250929", label: "Sonnet 4.5" },
            { id: "claude-opus-4-6", label: "Opus 4.6" },
          ],
          default: "claude-sonnet-4-5-20250929",
        };
      }
      return {};
    });
  });

  it("renders course title and upload date", async () => {
    renderCourse();
    expect(await screen.findByText("Biology 101")).toBeInTheDocument();
    expect(screen.getByText(/Uploaded/)).toBeInTheDocument();
  });

  it("renders Back to courses button", async () => {
    renderCourse();
    await screen.findByText("Biology 101");

    const backButton = screen.getByText(/Back to courses/);
    await userEvent.click(backButton);
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("renders chapter list for ready course", async () => {
    renderCourse();
    expect(await screen.findByText("1. Introduction to Cells")).toBeInTheDocument();
    expect(screen.getByText("2. Genetics")).toBeInTheDocument();
  });

  it("expands chapter on click to show summaries", async () => {
    const user = userEvent.setup();
    renderCourse();

    const chapterButton = await screen.findByText("1. Introduction to Cells");
    await user.click(chapterButton);

    expect(screen.getByText("Main Topics")).toBeInTheDocument();
    expect(screen.getByText("Cell Structure")).toBeInTheDocument();
    expect(screen.getByText("Cells are the basic unit of life.")).toBeInTheDocument();
    expect(screen.getByText("Side Topics")).toBeInTheDocument();
    expect(screen.getByText("History of Microscopy")).toBeInTheDocument();
  });

  it("shows key terms in expanded chapter", async () => {
    const user = userEvent.setup();
    renderCourse();

    await user.click(await screen.findByText("1. Introduction to Cells"));

    expect(screen.getByText("Nucleus")).toBeInTheDocument();
    expect(screen.getByText("Membrane")).toBeInTheDocument();
  });

  it("shows exam and discussion questions in expanded chapter", async () => {
    const user = userEvent.setup();
    renderCourse();

    await user.click(await screen.findByText("1. Introduction to Cells"));

    expect(screen.getByText("Exam Questions")).toBeInTheDocument();
    expect(screen.getByText(/What is the nucleus\?/)).toBeInTheDocument();
    expect(screen.getByText("Discussion Questions")).toBeInTheDocument();
    expect(screen.getByText(/Why are cells important\?/)).toBeInTheDocument();
  });

  it("toggles exam question answer visibility", async () => {
    const user = userEvent.setup();
    renderCourse();

    await user.click(await screen.findByText("1. Introduction to Cells"));

    const showButton = screen.getByText("Show suggested answer");
    await user.click(showButton);

    expect(
      screen.getByText("The nucleus is the cell's control center.")
    ).toBeInTheDocument();

    await user.click(screen.getByText("Hide answer"));
    expect(
      screen.queryByText("The nucleus is the cell's control center.")
    ).not.toBeInTheDocument();
  });

  it("toggles discussion question answer visibility", async () => {
    const user = userEvent.setup();
    renderCourse();

    await user.click(await screen.findByText("1. Introduction to Cells"));

    await user.click(screen.getByText("Why ask this?"));
    expect(
      screen.getByText("Cells are the building blocks of all life.")
    ).toBeInTheDocument();

    await user.click(screen.getByText("Hide"));
    expect(
      screen.queryByText("Cells are the building blocks of all life.")
    ).not.toBeInTheDocument();
  });

  it("collapses chapter on second click", async () => {
    const user = userEvent.setup();
    renderCourse();

    const chapterButton = await screen.findByText("1. Introduction to Cells");
    await user.click(chapterButton);
    expect(screen.getByText("Main Topics")).toBeInTheDocument();

    await user.click(chapterButton);
    expect(screen.queryByText("Main Topics")).not.toBeInTheDocument();
  });

  it("shows action buttons for ready course", async () => {
    renderCourse();

    expect(await screen.findByText("Create Study Plan")).toBeInTheDocument();
    expect(screen.getByText("Start Quiz (all chapters)")).toBeInTheDocument();
  });

  it("navigates to study plan page", async () => {
    const user = userEvent.setup();
    renderCourse();

    await user.click(await screen.findByText("Create Study Plan"));
    expect(mockNavigate).toHaveBeenCalledWith("/study-plan/course-1");
  });

  it("navigates to quiz with all chapters", async () => {
    const user = userEvent.setup();
    renderCourse();

    await user.click(await screen.findByText("Start Quiz (all chapters)"));
    expect(mockNavigate).toHaveBeenCalledWith("/quiz/course-1?chapters=ch1,ch2");
  });

  it("shows processing prompt for uploaded course", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === "/api/courses/course-1") return uploadedCourse;
      if (url === "/api/ai/models") {
        return {
          models: [{ id: "claude-sonnet-4-5-20250929", label: "Sonnet 4.5" }],
          default: "claude-sonnet-4-5-20250929",
        };
      }
      return {};
    });

    renderCourse();

    expect(
      await screen.findByText("PDF uploaded. Ready to process with AI?")
    ).toBeInTheDocument();
    expect(screen.getByText("Summarize with AI")).toBeInTheDocument();
  });

  it("shows processing state", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === "/api/courses/course-1") return processingCourse;
      if (url === "/api/ai/models") {
        return { models: [], default: "" };
      }
      if (url.startsWith("/api/ai/progress/")) {
        return { step: "extracting", currentChapter: 0, totalChapters: 0, chapterTitle: "" };
      }
      return {};
    });

    renderCourse();

    expect(await screen.findByText("Extracting text from PDF...")).toBeInTheDocument();
    expect(screen.getByText("Stop processing")).toBeInTheDocument();
  });

  it("shows error state with retry button", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === "/api/courses/course-1") return errorCourse;
      if (url === "/api/ai/models") {
        return {
          models: [{ id: "claude-sonnet-4-5-20250929", label: "Sonnet 4.5" }],
          default: "claude-sonnet-4-5-20250929",
        };
      }
      return {};
    });

    renderCourse();

    expect(
      await screen.findByText("Something went wrong while processing.")
    ).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows loading spinner when course is not yet loaded", () => {
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));
    renderCourse();
    // The spinner is rendered (no text, just a div with animate-spin)
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows error when course fails to load", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Network error"));
    renderCourse();
    expect(await screen.findByText("Failed to load course")).toBeInTheDocument();
  });

  it("shows translate buttons in expanded chapter questions", async () => {
    const user = userEvent.setup();
    renderCourse();

    await user.click(await screen.findByText("1. Introduction to Cells"));

    // Find Original buttons (translate buttons)
    const originalButtons = screen.getAllByText("Original");
    expect(originalButtons.length).toBeGreaterThan(0);
  });
});
