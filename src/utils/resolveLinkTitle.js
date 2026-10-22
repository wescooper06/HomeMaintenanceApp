const titleCache = new Map();

function text(value) {
  return String(value ?? "").trim();
}

function publicUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password &&
      url.hostname.includes(".") && !url.hostname.includes(":") && !/^[\d.]+$/.test(url.hostname) &&
      !/(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname) &&
      ![...url.searchParams.keys()].some((key) => /token|password|credential|secret|signature|auth|api.?key/i.test(key));
  } catch {
    return false;
  }
}

function youtubeVideoId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);
    if (host === "youtu.be" || host.endsWith(".youtu.be")) return text(segments[0]);
    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com")) {
      if (url.searchParams.get("v")) return text(url.searchParams.get("v"));
      for (const kind of ["shorts", "embed"]) {
        const index = segments.indexOf(kind);
        if (index >= 0 && segments[index + 1]) return text(segments[index + 1]);
      }
    }
  } catch {
    return "";
  }
  return "";
}

function fetchJsonp(url, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const callback = `tripsJsonp_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement("script");
    let timeout;
    const cleanup = () => {
      window.clearTimeout(timeout);
      script.remove();
      delete window[callback];
    };
    window[callback] = (payload) => { cleanup(); resolve(payload || {}); };
    script.onerror = () => { cleanup(); reject(new Error("JSONP request failed.")); };
    timeout = window.setTimeout(() => { cleanup(); reject(new Error("JSONP request timed out.")); }, timeoutMs);
    const endpoint = new URL(url);
    endpoint.searchParams.set("callback", callback);
    script.src = endpoint.href;
    document.body.appendChild(script);
  });
}

async function request(url) {
  const response = await fetch(url, { method: "GET", credentials: "omit", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Title lookup failed.");
  return response;
}

async function oembedTitle(endpoint, targetUrl) {
  const url = new URL(endpoint);
  url.searchParams.set("url", targetUrl);
  url.searchParams.set("format", "json");
  const payload = await (await request(url.href)).json();
  return text(payload?.title);
}

async function proxyTitle(targetUrl) {
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", targetUrl);
  endpoint.searchParams.set("format", "json");
  const response = await request(`https://r.jina.ai/http://${endpoint.href.replace(/^https?:\/\//i, "")}`);
  const body = await response.text();
  try {
    const payload = JSON.parse(body);
    return text(payload.title || payload.data?.title);
  } catch {
    const match = body.match(/"title"\s*:\s*("(?:\\.|[^"\\])*")/i);
    return match ? text(JSON.parse(match[1])) : "";
  }
}

export async function resolveLinkTitle(url) {
  const originalUrl = text(url);
  const fallback = { title: originalUrl, url: originalUrl };
  if (!originalUrl || !publicUrl(originalUrl)) return fallback;
  if (titleCache.has(originalUrl)) return { title: titleCache.get(originalUrl), url: originalUrl };
  const videoId = youtubeVideoId(originalUrl);
  const canonicalUrl = videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : originalUrl;
  const resolved = (title) => {
    const document = new DOMParser().parseFromString(title, "text/html");
    const label = text(document.querySelector("title")?.textContent || document.body.textContent).replace(/\s*-\s*YouTube\s*$/i, "");
    if (!label) return fallback;
    titleCache.set(originalUrl, label);
    return { title: label, url: originalUrl };
  };

  if (videoId) {
    const title = await attempt(() => oembedTitle("https://noembed.com/embed", canonicalUrl));
    if (title) return resolved(title);
    const jsonpTitle = await attempt(async () => {
      const payload = await fetchJsonp(`https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`);
      return text(payload.title);
    });
    if (jsonpTitle) return resolved(jsonpTitle);
  }

  for (const endpoint of ["https://www.youtube.com/oembed", "https://www.youtube-nocookie.com/oembed", "https://noembed.com/embed"]) {
    const title = await attempt(() => oembedTitle(endpoint, canonicalUrl));
    if (title) return resolved(title);
  }

  if (videoId) {
    const title = await attempt(() => proxyTitle(canonicalUrl));
    if (title) return resolved(title);
  }
  try {
    const html = await (await request(canonicalUrl)).text();
    const title = new DOMParser().parseFromString(html, "text/html").querySelector("title")?.textContent;
    return title ? resolved(title) : fallback;
  } catch {
    return fallback;
  }
}

async function attempt(resolveTitle) {
  try {
    return await resolveTitle();
  } catch {
    return "";
  }
}