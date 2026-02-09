import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Landing from "./Landing";
import { supabase } from "../lib/supabase";

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>
  );
}

describe("Landing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the heading and tagline", () => {
    renderLanding();
    expect(screen.getByText("StudyFlow")).toBeInTheDocument();
    expect(
      screen.getByText("Upload your course, let AI do the work.")
    ).toBeInTheDocument();
  });

  it("renders Google sign-in button", () => {
    renderLanding();
    expect(
      screen.getByRole("button", { name: /continue with google/i })
    ).toBeInTheDocument();
  });

  it("renders email and password inputs", () => {
    renderLanding();
    expect(screen.getByPlaceholderText("Email address")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
  });

  it("defaults to sign-in mode", () => {
    renderLanding();
    expect(
      screen.getByRole("button", { name: "Sign in" })
    ).toBeInTheDocument();
    expect(screen.getByText("Don't have an account?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
  });

  it("toggles to sign-up mode", async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(
      screen.getByRole("button", { name: "Create account" })
    ).toBeInTheDocument();
    expect(screen.getByText("Already have an account?")).toBeInTheDocument();
  });

  it("toggles back to sign-in mode", async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      screen.getByRole("button", { name: "Sign in" })
    ).toBeInTheDocument();
  });

  it("calls signInWithGoogle when Google button is clicked", async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(
      screen.getByRole("button", { name: /continue with google/i })
    );

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  });

  it("calls signInWithPassword on sign-in submit", async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.type(screen.getByPlaceholderText("Email address"), "test@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "password123",
    });
  });

  it("calls signUp on sign-up submit", async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await user.type(screen.getByPlaceholderText("Email address"), "new@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "newpass123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "newpass123",
    });
  });

  it("displays error message on failed sign-in", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Invalid credentials", name: "AuthApiError", status: 401 },
    } as never);

    const user = userEvent.setup();
    renderLanding();

    await user.type(screen.getByPlaceholderText("Email address"), "bad@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
  });

  it("shows loading state during submission", async () => {
    // Make sign-in hang
    vi.mocked(supabase.auth.signInWithPassword).mockImplementationOnce(
      () => new Promise(() => {})
    );

    const user = userEvent.setup();
    renderLanding();

    await user.type(screen.getByPlaceholderText("Email address"), "test@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByText("Please wait...")).toBeInTheDocument();
  });

  it("clears error when toggling between sign-in and sign-up", async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Some error", name: "AuthApiError", status: 400 },
    } as never);

    const user = userEvent.setup();
    renderLanding();

    await user.type(screen.getByPlaceholderText("Email address"), "bad@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Some error")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign up" }));
    expect(screen.queryByText("Some error")).not.toBeInTheDocument();
  });
});
