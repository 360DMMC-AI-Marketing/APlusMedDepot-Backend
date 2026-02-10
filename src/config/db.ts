import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env";

let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const env = getEnv();
    _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  }
  return _supabase;
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const env = getEnv();
    _supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabaseAdmin;
}
