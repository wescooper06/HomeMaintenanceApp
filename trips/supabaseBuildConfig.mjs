const EXPECTED_PROJECT_REFERENCE = "tawvchmjtkgykwwvnnnn";

export function assertProductionSupabaseConfig(environment) {
  const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]
    .filter((name) => !environment[name]?.trim());
  if (missing.length) {
    throw new Error(`Production builds require ${missing.join(" and ")}.`);
  }

  let url;
  try {
    url = new URL(environment.VITE_SUPABASE_URL);
  } catch {
    throw new Error("VITE_SUPABASE_URL must be the production Supabase project URL.");
  }
  if (url.protocol !== "https:" || url.hostname !== `${EXPECTED_PROJECT_REFERENCE}.supabase.co`) {
    throw new Error("VITE_SUPABASE_URL must target the approved production Supabase project.");
  }

  const key = environment.VITE_SUPABASE_PUBLISHABLE_KEY.trim();
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return;
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error("Production builds must not contain a Supabase secret key.");
  }

  const segments = key.split(".");
  let role;
  try {
    if (segments.length === 3) role = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")).role;
  } catch {
    role = undefined;
  }
  if (role !== "anon") {
    throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY must have the public anon role.");
  }
}
