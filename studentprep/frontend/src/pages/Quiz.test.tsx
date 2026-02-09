import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Quiz from "./Quiz";
import { apiFetch } from "../lib/api";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderQuiz(courseId = "course-1", chapters = "ch1,ch2") {
  return render(
    <MemoryRouter
      initialEntries={[`/quiz/${courseId}?chapters=${chapters}`]}
    >
      <Routes>
        <Route path="/quiz/:courseId" element={<Quiz />} />
      </Routes>
    </MemoryRouter>
  );
}

const mockQuizData = {
  session_id: "session-1",
  questions: [
    {
      id: "q1",
      chapter_id: "ch1",
      question: "What is photosynthesis?",
      suggested_answer: "The process by which plants convert light energy into chemical energy.",
      is_review: false,
    },
    {
      id: "q2",
      chapter_id: "ch2",
      question: "Define mitosis.",
      suggested_answer: "Cell division resulting in two identical daughter cells.",
      is_review: true,
    },
  ],
  includes_review: true,
};

describe("Quiz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner while generating quiz", () => {
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));
    renderQuiz();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows error when missing course or chapters", async () => {
    render(
      <MemoryRouter initialEntries={["/quiz/course-1"]}>
        <Routes>
          <Route path="/quiz/:courseId" element={<Quiz />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      await screen.findByText("Missing course or chapter selection")
    ).toBeInTheDocument();
    expect(screen.getByText("Back to course")).toBeInTheDocument();
  });

  it("shows error when quiz generation fails", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Server error"));
    renderQuiz();

    expect(await screen.findByText("Server error")).toBeInTheDocument();
  });

  it("renders first question after loading", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(mockQuizData);
    renderQuiz();

    expect(await screen.findByText("What is photosynthesis?")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type your answer...")).toBeInTheDocument();
    expect(screen.getByText("Show answer")).toBeInTheDocument();
  });

  it("shows suggested answer when Show answer is clicked", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(mockQuizData);
    const user = userEvent.setup();
    renderQuiz();

    await screen.findByText("What is photosynthesis?");

    await user.type(
      screen.getByPlaceholderText("Type your answer..."),
      "Plants use sunlight"
    );
    await user.click(screen.getByText("Show answer"));

    expect(
      screen.getByText(
        "The process by which plants convert light energy into chemical energy."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Your answer")).toBeInTheDocument();
    expect(screen.getByText("Plants use sunlight")).toBeInTheDocument();
    expect(screen.getByText("Correct")).toBeInTheDocument();
    expect(screen.getByText("Incorrect")).toBeInTheDocument();
  });

  it("advances to next question after self-assessment", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(mockQuizData);
    const user = userEvent.setup();
    renderQuiz();

    await screen.findByText("What is photosynthesis?");

    await user.click(screen.getByText("Show answer"));
    await user.click(screen.getByText("Correct"));

    expect(await screen.findByText("Define mitosis.")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("shows review question badge", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(mockQuizData);
    const user = userEvent.setup();
    renderQuiz();

    await screen.findByText("What is photosynthesis?");

    // First question is not a review question
    expect(screen.queryByText("Review question")).not.toBeInTheDocument();

    // Move to second question
    await user.click(screen.getByText("Show answer"));
    await user.click(screen.getByText("Correct"));

    expect(await screen.findByText("Review question")).toBeInTheDocument();
  });

  it("shows quiz results after all questions are answered", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(mockQuizData) // Generate quiz
      .mockResolvedValueOnce({ score: 50 }); // Submit

    const user = userEvent.setup();
    renderQuiz();

    // Answer question 1 - Correct
    await screen.findByText("What is photosynthesis?");
    await user.click(screen.getByText("Show answer"));
    await user.click(screen.getByText("Correct"));

    // Answer question 2 - Incorrect
    await screen.findByText("Define mitosis.");
    await user.click(screen.getByText("Show answer"));
    await user.click(screen.getByText("Incorrect"));

    // Results screen
    expect(await screen.findByText("Quiz Complete!")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 correct")).toBeInTheDocument();
    expect(
      screen.getByText("Included spaced repetition questions")
    ).toBeInTheDocument();
  });

  it("calculates score locally when submit fails", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(mockQuizData) // Generate quiz
      .mockRejectedValueOnce(new Error("Submit failed")); // Submit fails

    const user = userEvent.setup();
    renderQuiz();

    // Answer both questions correctly
    await screen.findByText("What is photosynthesis?");
    await user.click(screen.getByText("Show answer"));
    await user.click(screen.getByText("Correct"));

    await screen.findByText("Define mitosis.");
    await user.click(screen.getByText("Show answer"));
    await user.click(screen.getByText("Correct"));

    // Should show 100% calculated locally
    expect(await screen.findByText("Quiz Complete!")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 correct")).toBeInTheDocument();
  });

  it("shows Back to course and Take another quiz buttons on results", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(mockQuizData)
      .mockResolvedValueOnce({ score: 100 });

    const user = userEvent.setup();
    renderQuiz();

    await screen.findByText("What is photosynthesis?");
    await user.click(screen.getByText("Show answer"));
    await user.click(screen.getByText("Correct"));

    await screen.findByText("Define mitosis.");
    await user.click(screen.getByText("Show answer"));
    await user.click(screen.getByText("Correct"));

    await screen.findByText("Quiz Complete!");

    await user.click(screen.getByText("Back to course"));
    expect(mockNavigate).toHaveBeenCalledWith("/course/course-1");
  });

  it("navigates back to course from header exit button", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(mockQuizData);
    const user = userEvent.setup();
    renderQuiz();

    await screen.findByText("What is photosynthesis?");

    await user.click(screen.getByText(/Exit quiz/));
    expect(mockNavigate).toHaveBeenCalledWith("/course/course-1");
  });

  it("sends quiz answers to API on submit", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(mockQuizData)
      .mockResolvedValueOnce({ score: 50 });

    const user = userEvent.setup();
    renderQuiz();

    await screen.findByText("What is photosynthesis?");
    await user.type(screen.getByPlaceholderText("Type your answer..."), "My answer");
    await user.click(screen.getByText("Show answer"));
    await user.click(screen.getByText("Correct"));

    await screen.findByText("Define mitosis.");
    await user.click(screen.getByText("Show answer"));
    await user.click(screen.getByText("Incorrect"));

    await screen.findByText("Quiz Complete!");

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/quiz/submit",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"sessionId":"session-1"'),
      })
    );
  });

  it("shows no questions message when quiz returns empty", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      session_id: "s1",
      questions: [],
      includes_review: false,
    });
    renderQuiz();

    expect(
      await screen.findByText("No questions available for the selected chapters")
    ).toBeInTheDocument();
  });

  it("calls generate quiz API with correct parameters", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(mockQuizData);
    renderQuiz("course-1", "ch1,ch2");

    await screen.findByText("What is photosynthesis?");

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/quiz/generate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ chapterIds: ["ch1", "ch2"], courseId: "course-1" }),
      })
    );
  });
});
