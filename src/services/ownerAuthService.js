const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createOwnerAuthController(client, ownerId, clock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (id) => clearTimeout(id),
}) {
  const configured = uuid.test(ownerId || "") && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(ownerId);
  let state = { status: "checking", error: "" };
  let revision = 0;
  let stopped = false;
  let signingOut = false;
  let timer;
  let subscription;
  const listeners = new Set();
  const publish = (next) => {
    state = next;
    listeners.forEach((listener) => listener(state));
  };
  const close = (error = "") => {
    revision += 1;
    clock.clearTimeout(timer);
    publish({ status: "signed-out", error });
  };

  async function validate(session) {
    const request = ++revision;
    clock.clearTimeout(timer);
    publish({ status: "checking", error: "" });
    if (!configured) {
      close("Owner login is not configured. Contact the application owner.");
      return;
    }
    if (!session?.access_token) {
      close();
      return;
    }
    try {
      const { data, error } = await client.auth.getUser(session.access_token);
      if (stopped || request !== revision) return;
      if (error || !data?.user || data.user.id.toLowerCase() !== ownerId.toLowerCase()) {
        close("This session is invalid or is not the designated owner. Sign in with the owner account.");
        return;
      }
      if (!Number.isFinite(session.expires_at) || session.expires_at * 1000 <= clock.now()) {
        close("Your session expired. Sign in again.");
        return;
      }
      publish({ status: "owner", error: "" });
      timer = clock.setTimeout(() => {
        close("Your session expired. Sign in again.");
      }, Math.min(session.expires_at * 1000 - clock.now(), 2147483647));
    } catch {
      if (!stopped && request === revision) close("Unable to validate your session. Check your connection and sign in again.");
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async start() {
      stopped = false;
      subscription = client.auth.onAuthStateChange((_event, session) => {
        if (stopped || (signingOut && session)) return;
        // Never await Auth calls inside Supabase's session notification lock.
        close();
        const request = revision;
        void Promise.resolve().then(() => {
          if (!stopped && request === revision) return validate(session);
        });
      }).data.subscription;
      const request = revision;
      try {
        const { data, error } = await client.auth.getSession();
        if (stopped || request !== revision) return;
        if (error) close("Unable to load your session. Sign in again.");
        else await validate(data.session);
      } catch {
        if (!stopped && request === revision) close("Unable to load your session. Check your connection.");
      }
    },
    async signIn(email, password) {
      signingOut = false;
      close();
      const request = revision;
      try {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (stopped) return;
        if (error) close("Sign-in failed. Check your credentials and account confirmation.");
        else if (request === revision) await validate(data.session);
      } catch {
        if (!stopped) close("Sign-in failed. Check your connection and try again.");
      }
    },
    async signOut() {
      signingOut = true;
      close();
      try {
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) close("Local sign-out could not be completed. Close this browser session and retry.");
      } catch {
        close("Local sign-out could not be completed. Close this browser session and retry.");
      }
    },
    stop() {
      stopped = true;
      revision += 1;
      clock.clearTimeout(timer);
      subscription?.unsubscribe();
    },
  };
}
