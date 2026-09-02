import { createClient } from "@supabase/supabase-js";

function required(value: string | undefined, name: string): string {
  if (!value || !value.trim()) throw new Error(`Supabase configuration is missing: ${name}`);
  return value;
}

export const supabase = createClient(
  required(import.meta.env.VITE_SUPABASE_URL, "VITE_SUPABASE_URL"),
  required(import.meta.env.VITE_SUPABASE_ANON_KEY, "VITE_SUPABASE_ANON_KEY"),
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
