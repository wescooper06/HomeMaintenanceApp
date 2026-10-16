(function (root) {
  "use strict";

  const TOKEN_KEY = "hm_google_access_token";
  const EXPIRY_KEY = "hm_google_access_token_expires_at";
  const SCOPES_KEY = "hm_google_access_token_scopes";
  const GRANTED_SCOPES_KEY = "hm_google_granted_scopes";
  const LEGACY_SHEETS_TOKEN_KEY = "trips_sheets_access_token";
  const LEGACY_SHEETS_EXPIRY_KEY = "trips_sheets_access_token_expires_at";
  const TOKEN_EXPIRY_BUFFER_MS = 30000;
  const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
  const SCOPES = Object.freeze({
    sheets: "https://www.googleapis.com/auth/spreadsheets",
    calendarRead: "https://www.googleapis.com/auth/calendar.readonly",
    calendarEvents: "https://www.googleapis.com/auth/calendar.events",
  });
  const DEFAULT_SCOPES = Object.values(SCOPES);

  let initialized = false;
  let initPromise = null;
  const pendingRequests = new Map();

  function logError(message, error) {
    if (root.console && typeof root.console.error === "function") {
      root.console.error(`[Auth] ${message}`, error || "");
    }
  }

  function logWarning(message, error) {
    if (root.console && typeof root.console.warn === "function") {
      root.console.warn(`[Auth] ${message}`, error || "");
    }
  }

  function normalizeScopes(scopes) {
    const input = scopes == null ? DEFAULT_SCOPES : Array.isArray(scopes) ? scopes : [scopes];
    const normalized = input
      .flatMap((scope) => String(scope || "").trim().split(/\s+/))
      .filter(Boolean);
    return Array.from(new Set(normalized)).sort();
  }

  function includesScopes(grantedScopes, requestedScopes) {
    const granted = new Set(grantedScopes);
    return requestedScopes.every((scope) => granted.has(scope));
  }

  function getPreviouslyGrantedScopes() {
    return normalizeScopes(root.localStorage.getItem(GRANTED_SCOPES_KEY) || []);
  }

  function rememberScopes(scopes) {
    const mergedScopes = normalizeScopes([...getPreviouslyGrantedScopes(), ...scopes]);
    root.localStorage.setItem(GRANTED_SCOPES_KEY, mergedScopes.join(" "));
    return mergedScopes;
  }

  function getClientId() {
    try {
      const parentConfig = root.parent && root.parent !== root ? root.parent.APP_CONFIG : null;
      const clientId = (parentConfig && parentConfig.GOOGLE_CLIENT_ID)
        || (root.APP_CONFIG && root.APP_CONFIG.GOOGLE_CLIENT_ID);
      if (clientId) return String(clientId).trim();
    } catch (error) {
      logWarning("Could not read APP_CONFIG from the parent frame.", error);
    }
    return "";
  }

  function gisReady() {
    return Boolean(root.google && root.google.accounts && root.google.accounts.oauth2);
  }

  async function waitForGIS() {
    if (gisReady()) return;
    if (!root.document) throw new Error("Google Identity Services requires a browser document.");

    let script = root.document.querySelector(`script[src="${GIS_SCRIPT_URL}"]`);
    if (!script) {
      script = root.document.createElement("script");
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      root.document.head.appendChild(script);
    }

    const deadline = Date.now() + 10000;
    while (!gisReady() && Date.now() < deadline) {
      await new Promise((resolve) => root.setTimeout(resolve, 100));
    }
    if (!gisReady()) throw new Error("Google Identity Services did not load within 10 seconds.");
  }

  function readStoredToken() {
    const storage = root.localStorage;
    const token = storage.getItem(TOKEN_KEY) || "";
    const expiresAt = Number(storage.getItem(EXPIRY_KEY) || 0);
    if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
      if (token || expiresAt) clearStoredToken();
      return null;
    }
    return {
      token,
      scopes: normalizeScopes(storage.getItem(SCOPES_KEY) || []),
    };
  }

  function clearStoredToken() {
    const storage = root.localStorage;
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(EXPIRY_KEY);
    storage.removeItem(SCOPES_KEY);
  }

  function migrateLegacySheetsToken() {
    const storage = root.localStorage;
    const legacyToken = storage.getItem(LEGACY_SHEETS_TOKEN_KEY) || "";
    const legacyExpiry = Number(storage.getItem(LEGACY_SHEETS_EXPIRY_KEY) || 0);
    if (legacyToken && Number.isFinite(legacyExpiry) && legacyExpiry > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
      rememberScopes([SCOPES.sheets]);
      if (!readStoredToken()) {
        storage.setItem(TOKEN_KEY, legacyToken);
        storage.setItem(EXPIRY_KEY, String(legacyExpiry));
        storage.setItem(SCOPES_KEY, SCOPES.sheets);
      }
    }
    storage.removeItem(LEGACY_SHEETS_TOKEN_KEY);
    storage.removeItem(LEGACY_SHEETS_EXPIRY_KEY);
  }

  function migrateSessionToken() {
    const sessionStorage = root.sessionStorage;
    if (!sessionStorage) return;

    const token = sessionStorage.getItem(TOKEN_KEY) || "";
    const expiresAt = Number(sessionStorage.getItem(EXPIRY_KEY) || 0);
    if (token && Number.isFinite(expiresAt) && expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
      const calendarScopes = [SCOPES.calendarRead, SCOPES.calendarEvents];
      rememberScopes(calendarScopes);
      if (!readStoredToken()) {
        root.localStorage.setItem(TOKEN_KEY, token);
        root.localStorage.setItem(EXPIRY_KEY, String(expiresAt));
        root.localStorage.setItem(SCOPES_KEY, calendarScopes.join(" "));
      }
    }
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
  }

  function storeToken(response, requestedScopes) {
    const token = String(response && response.access_token || "").trim();
    if (!token) throw new Error("Google authorization returned no access token.");

    const grantedScopes = normalizeScopes(response.scope || requestedScopes);
    if (!includesScopes(grantedScopes, requestedScopes)) {
      throw new Error("Google authorization did not grant all requested scopes.");
    }

    const expiresIn = Number(response.expires_in);
    const expiresAt = Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000;
    const storage = root.localStorage;
    storage.setItem(TOKEN_KEY, token);
    storage.setItem(EXPIRY_KEY, String(expiresAt));
    storage.setItem(SCOPES_KEY, grantedScopes.join(" "));
    rememberScopes(grantedScopes);
    return token;
  }

  function requestToken(scopes, prompt) {
    const requestKey = `${prompt}:${scopes.join(" ")}`;
    if (pendingRequests.has(requestKey)) return pendingRequests.get(requestKey);

    const request = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };

      try {
        const client = root.google.accounts.oauth2.initTokenClient({
          client_id: getClientId(),
          scope: scopes.join(" "),
          callback(response) {
            if (!response || response.error) {
              const message = response && (response.error_description || response.error);
              finish(reject, new Error(message || "Google authorization failed."));
              return;
            }
            try {
              finish(resolve, storeToken(response, scopes));
            } catch (error) {
              finish(reject, error);
            }
          },
          error_callback(error) {
            finish(reject, new Error(error && (error.message || error.type) || "Google sign-in was cancelled or blocked."));
          },
        });
        client.requestAccessToken({ prompt });
      } catch (error) {
        finish(reject, error);
      }
    }).catch((error) => {
      logError(prompt ? "Interactive authorization failed." : "Silent authorization failed.", error);
      throw error;
    }).finally(() => pendingRequests.delete(requestKey));

    pendingRequests.set(requestKey, request);
    return request;
  }

  const Auth = {
    SCOPES,

    async init() {
      if (initialized) return Auth;
      if (initPromise) return initPromise;

      initPromise = (async () => {
        if (!getClientId()) throw new Error("APP_CONFIG.GOOGLE_CLIENT_ID is not configured.");
        await waitForGIS();
        migrateLegacySheetsToken();
        migrateSessionToken();

        const token = root.localStorage.getItem(TOKEN_KEY);
        if (token && !root.localStorage.getItem(SCOPES_KEY)) {
          root.localStorage.setItem(SCOPES_KEY, [SCOPES.calendarRead, SCOPES.calendarEvents].join(" "));
        }
        if (token) rememberScopes(normalizeScopes(root.localStorage.getItem(SCOPES_KEY)));
        initialized = true;
        return Auth;
      })().catch((error) => {
        initPromise = null;
        logError("Initialization failed.", error);
        throw error;
      });
      return initPromise;
    },

    async signIn(scopes) {
      const requestedScopes = normalizeScopes([...normalizeScopes(scopes), ...getPreviouslyGrantedScopes()]);
      try {
        await Auth.init();
        return await requestToken(requestedScopes, "consent");
      } catch (error) {
        logError("Sign-in failed.", error);
        throw error;
      }
    },

    async ensureAuthenticated(scopes) {
      const requestedScopes = normalizeScopes(scopes);
      try {
        await Auth.init();
        const stored = readStoredToken();
        if (stored && includesScopes(stored.scopes, requestedScopes)) return stored.token;
        try {
          const authorizationScopes = normalizeScopes([...requestedScopes, ...getPreviouslyGrantedScopes()]);
          return await requestToken(authorizationScopes, "");
        } catch (error) {
          const authError = new Error("Authentication or additional consent is required. Call Auth.signIn() from a user action.");
          authError.cause = error;
          throw authError;
        }
      } catch (error) {
        logError("Could not ensure an authenticated session.", error);
        throw error;
      }
    },

    getToken(scopes) {
      try {
        migrateLegacySheetsToken();
        migrateSessionToken();
        const stored = readStoredToken();
        if (!stored) return "";
        if (scopes != null && !includesScopes(stored.scopes, normalizeScopes(scopes))) return "";
        return stored.token;
      } catch (error) {
        logError("Could not read the stored access token.", error);
        return "";
      }
    },

    async signOut() {
      let token = "";
      try {
        token = root.localStorage.getItem(TOKEN_KEY) || "";
        clearStoredToken();
        root.localStorage.removeItem(LEGACY_SHEETS_TOKEN_KEY);
        root.localStorage.removeItem(LEGACY_SHEETS_EXPIRY_KEY);
        root.localStorage.removeItem(GRANTED_SCOPES_KEY);
        if (root.sessionStorage) {
          root.sessionStorage.removeItem(TOKEN_KEY);
          root.sessionStorage.removeItem(EXPIRY_KEY);
        }
      } catch (error) {
        logError("Could not clear all locally stored authorization data.", error);
      }

      const oauth2 = root.google && root.google.accounts && root.google.accounts.oauth2;
      if (token && oauth2 && typeof oauth2.revoke === "function") {
        try {
          await new Promise((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              root.clearTimeout(timeoutId);
              resolve();
            };
            const timeoutId = root.setTimeout(() => {
              logWarning("Token revocation timed out; local credentials were cleared.");
              finish();
            }, 5000);
            oauth2.revoke(token, (response) => {
              if (response && response.error) logWarning("Google did not confirm token revocation.", response.error);
              finish();
            });
          });
        } catch (error) {
          logWarning("Token revocation failed; local credentials were cleared.", error);
        }
      }
    },
  };

  root.Auth = Auth;
  if (typeof module !== "undefined" && module.exports) module.exports = Auth;
})(typeof globalThis !== "undefined" ? globalThis : this);