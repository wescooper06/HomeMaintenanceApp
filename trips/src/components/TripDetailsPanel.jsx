import { useEffect, useState } from "react";
import { tripPriority } from "../utils/priorityUtils.js";

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
      return { url: url.href, label: String(label) };
    } catch {
      return { url: "", label: String(label) };
    }
  }).filter((entry) => entry.label);
}

export default function TripDetailsPanel({ trip, titleId = "trip-details-title", resolveTitle, children }) {
  const [links, setLinks] = useState(() => linkEntries(trip.links));
  const priority = tripPriority(trip);
  const tags = (Array.isArray(trip.tags) ? trip.tags : String(trip.tags || "").split(/[,;\n]/)).map((tag) => String(tag).trim()).filter(Boolean);
  const considerations = String(trip.considerations || "").split(/\r?\n|;\s*/).map((item) => item.trim()).filter(Boolean);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(linkEntries(trip.links).map(async (entry) => {
      if (!entry.url) return entry;
      try {
        const result = await resolveTitle(entry.url);
        return { ...entry, label: result.title || entry.url };
      } catch {
        return { ...entry, label: entry.url };
      }
    })).then((resolved) => {
      if (!controller.signal.aborted) setLinks(resolved);
    });
    return () => controller.abort();
  }, [trip.links, resolveTitle]);

  return (
    <article className="view-trip-card" aria-labelledby={titleId}>
      <header className="trip-modal-header">
        <div><p className="trip-eyebrow">Expanded idea</p><h1 id={titleId}>{trip.destination}</h1><p className="view-trip-subtitle">{[trip.tripType, trip.duration].filter(Boolean).join(" / ")}</p></div>
        <span className={`trip-status trip-status-${String(trip.status || "Idea").toLowerCase().replace(/\s/g, "-")}`}>{trip.status || "Idea"}</span>
      </header>
      <dl className="view-trip-grid">
        <div><dt>LINKS</dt><dd>{links.length ? <ul className="view-trip-links">{links.map((link, index) => <li key={`${link.url}-${index}`}>{link.url ? <a href={link.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title={link.url}>{link.label}</a> : link.label}</li>)}</ul> : "None"}</dd></div>
        <div><dt>Estimated cost range</dt><dd className="view-trip-cost">{trip.costRange || "Not set"}</dd></div>
        <div><dt>Seasonality notes</dt><dd>{trip.seasonality || "None"}</dd></div>
        <div><dt>Considerations</dt><dd>{considerations.length ? <ul className="view-trip-considerations">{considerations.map((item, index) => <li key={index}>{item}</li>)}</ul> : "None"}</dd></div>
        <div><dt>Tags</dt><dd className="view-trip-tags">{tags.length ? tags.map((tag, index) => <span key={index}>{tag}</span>) : "None"}</dd></div>
        <div><dt>Notes</dt><dd>{trip.notes || "None"}</dd></div>
        <div><dt>Priority</dt><dd>{priority === null ? "Not prioritized" : <span className="trip-priority-badge">#{priority}</span>}</dd></div>
      </dl>
      {children}
    </article>
  );
}