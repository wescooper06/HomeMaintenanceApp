export const GOOGLE_SCOPES = Object.freeze({
  calendarRead: "https://www.googleapis.com/auth/calendar.readonly",
  calendarEvents: "https://www.googleapis.com/auth/calendar.events",
});

const TOKEN_KEY = "life_manager_calendar_token";
const EXPIRY_KEY = "life_manager_calendar_token_expires_at";
const SCOPES_KEY = "life_manager_calendar_token_scopes";
const GIS_URL = "https://accounts.google.com/gsi/client";
const calendarScopes = [GOOGLE_SCOPES.calendarRead, GOOGLE_SCOPES.calendarEvents];
const normalize = (scopes = calendarScopes) => [...new Set(
  (Array.isArray(scopes) ? scopes : [scopes]).flatMap((scope) => String(scope).split(/\s+/)).filter(Boolean)
)].sort();

export function createGoogleAuth({ clientId, root = globalThis, now = Date.now } = {}) {
  let initialization;
  let pending;
  let generation = 0;
  const oauth = () => root.google?.accounts?.oauth2;

  function clearToken() {
    for (const key of [TOKEN_KEY, EXPIRY_KEY, SCOPES_KEY]) root.localStorage.removeItem(key);
  }

  function readToken(storage) {
    const token = storage.getItem(TOKEN_KEY);
    const expiresAt = Number(storage.getItem(EXPIRY_KEY));
    if (!token || !Number.isFinite(expiresAt) || expiresAt <= now() + 30000) {
      if (token) clearToken(storage);
      return null;
    }
    return { token, expiresAt, scopes: normalize(storage.getItem(SCOPES_KEY) || []) };
  }

  function getToken(scopes = calendarScopes) {
    const stored = readToken(root.localStorage);
    if (!stored || !normalize(scopes).every((scope) => stored.scopes.includes(scope))) return "";
    return stored.token;
  }

  async function init() {
    if (initialization) return initialization;
    initialization = (async () => {
      if (!String(clientId || "").trim()) {
        throw new Error("Configure VITE_GOOGLE_CLIENT_ID in trips/.env.local to connect Google Calendar.");
      }
      if (oauth()) return;
      if (!root.document) throw new Error("Google authorization requires a browser document.");
      let script = root.document.querySelector(`script[src="${GIS_URL}"]`);
      if (!script) {
        script = root.document.createElement("script");
        script.src = GIS_URL;
        script.async = true;
        script.defer = true;
        root.document.head.appendChild(script);
      }
      const deadline = now() + 10000;
      while (!oauth() && now() < deadline) {
        await new Promise((resolve) => root.setTimeout(resolve, 100));
      }
      if (!oauth()) throw new Error("Google Identity Services did not load within 10 seconds.");
    })().catch((error) => {
      initialization = null;
      throw error;
    });
    return initialization;
  }

  async function signIn(scopes = calendarScopes) {
    const requested = normalize(scopes);
    const requestGeneration = generation;
    await init();
    if (requestGeneration !== generation) throw new Error("Google sign-in was cancelled by sign-out.");
    if (pending) {
      const token = await pending;
      if (getToken(requested)) return token;
      return signIn(requested);
    }
    const previous = readToken(root.localStorage);
    const authorizationScopes = normalize([...requested, ...(previous?.scopes || [])]);
    pending = new Promise((resolve, reject) => {
      const client = oauth().initTokenClient({
        client_id: String(clientId).trim(),
        scope: authorizationScopes.join(" "),
        callback(response) {
          try {
            if (requestGeneration !== generation) throw new Error("Google sign-in was cancelled by sign-out.");
            if (!response || response.error) {
              throw new Error(response?.error_description || response?.error || "Google authorization failed.");
            }
            const token = String(response.access_token || "").trim();
            const granted = normalize(response.scope || authorizationScopes);
            const expiresIn = Number(response.expires_in);
            if (!token || !requested.every((scope) => granted.includes(scope))) {
              throw new Error("Google authorization did not grant the requested access.");
            }
            if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
              throw new Error("Google authorization returned an invalid token expiry.");
            }
            root.localStorage.setItem(TOKEN_KEY, token);
            root.localStorage.setItem(EXPIRY_KEY, String(now() + expiresIn * 1000));
            root.localStorage.setItem(SCOPES_KEY, granted.join(" "));
            resolve(token);
          } catch (error) {
            reject(error);
          }
        },
        error_callback: (error) => reject(new Error(
          error?.message || error?.type || "Google sign-in was cancelled or blocked."
        )),
      });
      client.requestAccessToken({ prompt: "consent" });
    }).finally(() => { pending = null; });
    return pending;
  }

  async function ensureAuthenticated(scopes = calendarScopes) {
    const token = getToken(scopes);
    if (token) return token;
    throw new Error("Connect Google Calendar to authorize access, then retry.");
  }

  async function signOut() {
    generation += 1;
    const token = root.localStorage.getItem(TOKEN_KEY);
    clearToken();
    if (!token || !oauth()?.revoke) return;
    await new Promise((resolve, reject) => {
      const timeout = root.setTimeout(() => reject(new Error(
        "Google token revocation timed out; local credentials were cleared."
      )), 5000);
      try {
        oauth().revoke(token, (response) => {
          root.clearTimeout(timeout);
          if (response?.error) reject(new Error(`Google token revocation failed: ${response.error}`));
          else resolve();
        });
      } catch (error) {
        root.clearTimeout(timeout);
        reject(error);
      }
    });
  }

  return { init, getToken, signIn, ensureAuthenticated, signOut };
}

export const googleAuth = createGoogleAuth({
  clientId: import.meta.env?.VITE_GOOGLE_CLIENT_ID,
});
