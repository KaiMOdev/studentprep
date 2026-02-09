import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { getSupabaseAdmin } from "../services/supabase.js";
import { validateConfig } from "../services/config.js";
import type { AuthEnv } from "../types.js";

export const adminRoutes = new Hono<AuthEnv>();

// All admin routes require auth + admin role
adminRoutes.use("*", requireAuth);
adminRoutes.use("*", requireAdmin);

// Check if the current user is an admin (used by frontend to show/hide admin UI)
// This is mounted separately at /api/auth/me — see below for the meRoutes

// GET /api/admin/stats — Platform-wide statistics
adminRoutes.get("/stats", async (c) => {
  const supabase = getSupabaseAdmin();

  const [usersRes, coursesRes, quizzesRes, plansRes] = await Promise.all([
    supabase.auth.admin.listUsers({ perPage: 1, page: 1 }),
    supabase.from("courses").select("id", { count: "exact", head: true }),
    supabase.from("quiz_results").select("id", { count: "exact", head: true }),
    supabase.from("study_plans").select("id", { count: "exact", head: true }),
  ]);

  // Count courses by status
  const [uploadedRes, processingRes, readyRes, errorRes] = await Promise.all([
    supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "uploaded"),
    supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "processing"),
    supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "ready"),
    supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "error"),
  ]);

  return c.json({
    stats: {
      totalUsers: usersRes.data?.users?.length !== undefined
        ? (usersRes.data as any)?.total ?? usersRes.data.users.length
        : 0,
      totalCourses: coursesRes.count ?? 0,
      totalQuizzes: quizzesRes.count ?? 0,
      totalStudyPlans: plansRes.count ?? 0,
      coursesByStatus: {
        uploaded: uploadedRes.count ?? 0,
        processing: processingRes.count ?? 0,
        ready: readyRes.count ?? 0,
        error: errorRes.count ?? 0,
      },
    },
  });
});

// GET /api/admin/users — List all users with their course counts
adminRoutes.get("/users", async (c) => {
  const supabase = getSupabaseAdmin();

  // List all users from Supabase Auth
  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({
    perPage: 100,
    page: 1,
  });

  if (usersError) {
    return c.json({ error: usersError.message }, 500);
  }

  const users = usersData.users || [];

  // Get course counts per user
  const { data: courseCounts } = await supabase
    .from("courses")
    .select("user_id");

  // Get quiz counts per user
  const { data: quizCounts } = await supabase
    .from("quiz_results")
    .select("user_id");

  // Get subscription info
  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("user_id, plan, status");

  // Get admin profiles
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, role");

  // Build counts maps
  const courseCountMap: Record<string, number> = {};
  for (const row of courseCounts || []) {
    courseCountMap[row.user_id] = (courseCountMap[row.user_id] || 0) + 1;
  }

  const quizCountMap: Record<string, number> = {};
  for (const row of quizCounts || []) {
    quizCountMap[row.user_id] = (quizCountMap[row.user_id] || 0) + 1;
  }

  const subMap: Record<string, { plan: string; status: string }> = {};
  for (const row of subscriptions || []) {
    subMap[row.user_id] = { plan: row.plan, status: row.status };
  }

  const roleMap: Record<string, string> = {};
  for (const row of profiles || []) {
    roleMap[row.user_id] = row.role;
  }

  const enrichedUsers = users.map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    courses: courseCountMap[u.id] || 0,
    quizzes: quizCountMap[u.id] || 0,
    subscription: subMap[u.id] || { plan: "free", status: "inactive" },
    role: roleMap[u.id] || "user",
  }));

  return c.json({ users: enrichedUsers });
});

// PUT /api/admin/users/:userId/role — Update a user's role
adminRoutes.put("/users/:userId/role", async (c) => {
  const targetUserId = c.req.param("userId");
  const { role } = await c.req.json<{ role: string }>();

  if (!["user", "admin"].includes(role)) {
    return c.json({ error: "Invalid role. Must be 'user' or 'admin'" }, 400);
  }

  const supabase = getSupabaseAdmin();

  // Upsert the user_profiles record
  const { error } = await supabase
    .from("user_profiles")
    .upsert(
      { user_id: targetUserId, role, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true, userId: targetUserId, role });
});

// PUT /api/admin/users/:userId/plan — Update a user's subscription plan
adminRoutes.put("/users/:userId/plan", async (c) => {
  const targetUserId = c.req.param("userId");
  const { plan } = await c.req.json<{ plan: string }>();

  if (!["free", "pro"].includes(plan)) {
    return c.json({ error: "Invalid plan. Must be 'free' or 'pro'" }, 400);
  }

  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: targetUserId,
        plan,
        status: plan === "pro" ? "active" : "inactive",
      },
      { onConflict: "user_id" }
    );

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true, userId: targetUserId, plan });
});

// GET /api/admin/config — System configuration status
adminRoutes.get("/config", async (c) => {
  const config = validateConfig();
  return c.json({
    config: {
      supabase: config.supabase,
      anthropic: config.anthropic,
      stripe: config.stripe,
      ready: config.ready,
      missing: config.missing,
      adminEmails: (process.env.ADMIN_EMAILS || "").split(",").filter(Boolean).length,
    },
  });
});

// --- Separate route for /api/auth/me (no admin required, just auth) ---

export const authMeRoutes = new Hono<AuthEnv>();
authMeRoutes.use("*", requireAuth);

authMeRoutes.get("/me", async (c) => {
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");

  // Check admin status
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  let isAdmin = adminEmails.includes(userEmail.toLowerCase());

  if (!isAdmin) {
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("user_id", userId)
      .single();

    isAdmin = profile?.role === "admin";
  }

  return c.json({
    user: {
      id: userId,
      email: userEmail,
      isAdmin,
    },
  });
});
