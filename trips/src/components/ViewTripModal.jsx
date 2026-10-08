import { useEffect, useRef, useState } from "react";

const titleCache = new Map();

function readableLinkLabel(url) {
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname.split("/").filter(Boolean).slice(-2).map((segment) => {
    try {
      return decodeURIComponent(segment).replace(/[-_]/g, " ");
    } catch {
      return segment.replace(/[-_]/g, " ");
    }
  }).join(" / ").slice(0, 80);
  return path ? `${host} / ${path}` : host;
}

function linkEntries(value) {
  let entries = value || [];
  if (typeof entries === "string") {
    try {
      const parsed = JSON.parse(entries);
      entries = Array.isArray(parsed) ? parsed : entries;
    } catch {
      entries = value;
    }
    if (typeof entries === "string") entries = entries.split(/\r?\n|[,;]\s*(?=https?:\/\/)|\s+(?=https?:\/\/)/);
  }
  if (!Array.isArray(entries)) return [];
  return entries.filter(Boolean).map((entry) => {
    const rawUrl = String(typeof entry === "string" ? entry : entry.url || "").trim();
    const label = typeof entry === "object" ? entry.title || entry.label || rawUrl : rawUrl;
    try {
      const url = new URL(rawUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Unsupported link.");
      return { url: url.href, label: String(label) === rawUrl ? readableLinkLabel(url) : String(label) };
    } catch {
      return { url: "", label: String(label) };
    }
  }).filter((entry) => entry.label);
}

function isPublicLink(rawUrl) {
  const url = new URL(rawUrl);
  return url.hostname.includes(".") && !url.hostname.includes(":") && !/^[\d.]+$/.test(url.hostname) &&
    !/(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname) &&
    ![...url.searchParams.keys()].some((key) => /token|password|credential|secret|signature|auth|api.?key/i.test(key));
}

async function lookupPageTitle(url, signal) {
  const response = await fetch(`https://r.jina.ai/${url}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    credentials: "omit",
  });
  if (!response.ok) throw new Error("Title lookup failed.");
  const payload = await response.json();
  const title = payload.data?.title || payload.title;
  if (typeof title !== "string" || !title.trim()) return "";
  const document = new DOMParser().parseFromString(title, "text/html");
  const result = (document.querySelector("title")?.textContent || document.body.textContent || "").trim().slice(0, 300);
  if (/^(access denied|forbidden|just a moment|attention required|security verification)/i.test(result)) return "";
  return result;
}

async function pageTitle(url, signal) {
  if (!isPublicLink(url)) return "";
  if (titleCache.has(url)) return titleCache.get(url);
  const cleanUrl = new URL(url);
  cleanUrl.search = "";
  cleanUrl.hash = "";
  const candidates = [...new Set([url, cleanUrl.href])];
  for (const candidate of candidates) {
    if (signal.aborted) return "";
    try {
      const title = await lookupPageTitle(candidate, signal);
      if (title) {
        titleCache.set(url, title);
        return title;
      }
    } catch {
      if (signal.aborted) return "";
    }
  }
  return "";
}

export default function ViewTripModal({ trip, onClose }) {
  const dialog = useRef(null);
  const [links, setLinks] = useState(() => linkEntries(trip.links));
  const tags = (Array.isArray(trip.tags) ? trip.tags : String(trip.tags || "").split(/[,;\n]/)).map((tag) => String(tag).trim()).filter(Boolean);
  const considerations = String(trip.considerations || "").split(/\r?\n|;\s*/).map((item) => item.trim()).filter(Boolean);

  useEffect(() => {
    const modal = dialog.current;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    function fitVisibleViewport() {
      let height = window.innerHeight;
      try {
        const frame = window.frameElement;
        if (frame) {
          const bounds = frame.getBoundingClientRect();
          height = Math.max(0, Math.min(bounds.bottom, window.parent.innerHeight) - Math.max(bounds.top, 0));
        }
      } catch {
        height = window.innerHeight;
      }
      modal.style.height = `${height}px`;
    }
    fitVisibleViewport();
    window.addEventListener("resize", fitVisibleViewport);
    modal.showModal();
    modal.querySelector("button").focus();
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", fitVisibleViewport);
      modal.close();
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const entries = linkEntries(trip.links);
    Promise.all(entries.map(async (entry) => {
      if (!entry.url) return entry;
      try {
        const title = await pageTitle(entry.url, controller.signal);
        return { ...entry, label: title || entry.label };
      } catch {
        return entry;
      }
    })).then((resolved) => {
      if (!controller.signal.aborted) setLinks(resolved);
    });
    return () => controller.abort();
  }, [trip.links]);

  return (
    <dialog ref={dialog} className="capture-trip view-trip-modal" aria-labelledby="view-trip-title" aria-modal="true" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <article className="view-trip-card">
        <header className="trip-modal-header">
          <div><p className="trip-eyebrow">Expanded idea</p><h1 id="view-trip-title">{trip.destination}</h1><p className="view-trip-subtitle">{[trip.tripType, trip.duration].filter(Boolean).join(" / ")}</p></div>
          <span className={`trip-status trip-status-${String(trip.status || "Idea").toLowerCase().replace(/\s/g, "-")}`}>{trip.status || "Idea"}</span>
        </header>
        <dl className="view-trip-grid">
          <div><dt>Links</dt><dd>{links.length ? <ul className="view-trip-links">{links.map((link, index) => <li key={`${link.url}-${index}`}>{link.url ? <a href={link.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title={link.url}>{link.label}</a> : link.label}</li>)}</ul> : "None"}</dd></div>
          <div><dt>Estimated cost range</dt><dd className="view-trip-cost">{trip.costRange || "Not set"}</dd></div>
          <div><dt>Seasonality notes</dt><dd>{trip.seasonality || "None"}</dd></div>
          <div><dt>Considerations</dt><dd>{considerations.length ? <ul className="view-trip-considerations">{considerations.map((item, index) => <li key={index}>{item}</li>)}</ul> : "None"}</dd></div>
          <div><dt>Tags</dt><dd className="view-trip-tags">{tags.length ? tags.map((tag, index) => <span key={index}>{tag}</span>) : "None"}</dd></div>
          <div><dt>Notes</dt><dd>{trip.notes || "None"}</dd></div>
        </dl>
        <footer className="trip-modal-footer"><div className="capture-actions"><button type="button" className="button-secondary" onClick={() => onClose()}>Close</button></div></footer>
      </article>
    </dialog>
  );
}