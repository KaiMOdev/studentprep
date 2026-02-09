import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// Mock environment variables for Supabase
vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");

// Mock the supabase client
vi.mock("../lib/supabase", () => {
  const mockSubscription = { unsubscribe: vi.fn() };
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "test-token", user: { id: "user-1", email: "test@example.com" } } },
        }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: mockSubscription },
        }),
        signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
        signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
        signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  };
});

// Mock the API module
vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
  apiUpload: vi.fn(),
}));
