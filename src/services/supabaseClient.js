import { createClient } from "@supabase/supabase-js";

let client;

export function getSupabaseClient() {
  if (!client) {
    const url = import.meta.env?.VITE_SUPABASE_URL;
    const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new Error("Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in trips/.env.local.");
    }
    client = createClient(url, key);
  }
  return client;
}
