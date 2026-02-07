import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabaseAdmin: SupabaseClient<any, "public", any> | null = null;

export function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
    }

    // Using `any` for database types until we generate types from Supabase
    // Run: npx supabase gen types typescript --project-id <id> > src/database.types.ts
    supabaseAdmin = createClient<any>(url, key);
  }

  return supabaseAdmin;
}
