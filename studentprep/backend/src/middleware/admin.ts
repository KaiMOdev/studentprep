import { createMiddleware } from "hono/factory";
import { getSupabaseAdmin } from "../services/supabase.js";

// List of admin emails from environment variable (comma-separated)
function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// Middleware: requires requireAuth to run first (userId + userEmail on context)
// Checks if the authenticated user is an admin via:
//   1. ADMIN_EMAILS env var, OR
//   2. role = 'admin' in user_profiles table
export const requireAdmin = createMiddleware<{
  Variables: { userId: string; userEmail: string };
}>(async (c, next) => {
  const userEmail = c.get("userEmail");
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  // Check env-based admin list first (fast path)
  const adminEmails = getAdminEmails();
  if (adminEmails.includes(userEmail.toLowerCase())) {
    await next();
    return;
  }

  // Fall back to database role check (gracefully skip if table doesn't exist)
  try {
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (profile?.role === "admin") {
      await next();
      return;
    }
  } catch {
    // user_profiles table may not exist yet — skip DB check
  }

  return c.json({ error: "Admin access required" }, 403);
});
