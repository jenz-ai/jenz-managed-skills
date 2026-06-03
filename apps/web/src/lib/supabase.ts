// Supabase browser client — the dashboard's auth layer.
// URL + anon (publishable) key come from Vite env (apps/web/.env). The anon key
// is public by design; the agent-facing API stays open and never sees this.
import { createClient } from "@supabase/supabase-js";

const env = (import.meta as { env?: Record<string, string> }).env ?? {};
const url = env["VITE_SUPABASE_URL"];
const anon = env["VITE_SUPABASE_ANON_KEY"];

if (!url || !anon) {
  // Fail loud in the console rather than a cryptic runtime error deep in auth.
  console.warn(
    "[jenz] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — sign-in will not work.",
  );
}

export const supabase = createClient(url ?? "", anon ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // completes the magic-link / OAuth redirect
  },
});
