import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

export class UpgradeRequiredError extends Error {
  code = "UPGRADE_REQUIRED" as const;
  limit: string;
  constructor(message: string, limit: string) {
    super(message);
    this.name = "UpgradeRequiredError";
    this.limit = limit;
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 403 && body.code === "UPGRADE_REQUIRED") {
      throw new UpgradeRequiredError(body.error || "Upgrade required", body.limit || "unknown");
    }
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.json();
}

export async function apiFetchBlob(
  path: string,
  options: RequestInit = {}
): Promise<Blob> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.blob();
}

export async function apiUpload<T>(
  path: string,
  formData: FormData
): Promise<T> {
  const headers = await getAuthHeaders();
  // Don't set Content-Type — browser sets it with boundary for FormData

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Upload error: ${res.status}`);
  }

  return res.json();
}
