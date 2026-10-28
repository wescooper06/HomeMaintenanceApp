import { useEffect, useState } from "react";

import { createOwnerAuthController } from "../services/ownerAuthService.js";
import { getSupabaseClient } from "../services/supabaseClient.js";

export default function OwnerAuthBoundary({ children }) {
  const [controller] = useState(() => {
    try {
      return createOwnerAuthController(getSupabaseClient(), import.meta.env?.VITE_OWNER_AUTH_USER_ID);
    } catch {
      return null;
    }
  });
  const [session, setSession] = useState({ status: "checking", error: "" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!controller) return;
    const unsubscribe = controller.subscribe(setSession);
    void controller.start();
    return () => { unsubscribe(); controller.stop(); };
  }, [controller]);

  if (!controller) return <p role="alert">Supabase configuration is missing. Contact the application owner.</p>;
  if (session.status === "checking") return <p role="status">Checking owner session...</p>;
  if (session.status === "owner") {
    return <>
      <div aria-label="Owner session">
        <button type="button" onClick={() => { void controller.signOut(); }}>Sign out</button>
      </div>
      {children}
    </>;
  }
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const secret = password;
    setPassword("");
    try { await controller.signIn(email.trim(), secret); }
    finally { setBusy(false); }
  };
  return (
    <main>
      <h1>Life Manager owner login</h1>
      <p>Sign in with the designated owner account.</p>
      {session.error && <p role="alert">{session.error}</p>}
      <form onSubmit={submit} aria-busy={busy}>
        <label>Email <input type="email" autoComplete="username" required value={email}
          onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
        <label>Password <input type="password" autoComplete="current-password" required value={password}
          onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>
        <button type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
      </form>
    </main>
  );
}
