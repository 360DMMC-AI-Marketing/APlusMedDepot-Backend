import { createClient } from "@supabase/supabase-js";
import env from "./env";

export const supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Database operations ONLY — never call signInWithPassword/refreshSession on this client.
// Those methods set an in-memory session that replaces the service_role Authorization header,
// causing all subsequent DB operations to run as the signed-in user instead of service_role.
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Separate client for user-facing auth (signIn, signUp, refreshSession).
// Session contamination on this client does NOT affect database operations.
export const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
