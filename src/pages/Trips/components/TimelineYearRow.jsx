import { useLayoutEffect, useRef } from "react";

const DEFAULT_MARKER_HEIGHT = 56;
const RESIZE_DEBOUNCE_MS = 120;

export default function TimelineYearRow({ children, className = "", measurementKey = "" }) {
  const yearRef = useRef(null);

  useLayoutEffect(() => {
    const yearElement = yearRef.current;
    if (!yearElement) return undefined;

    function measureMarkers() {
      yearElement.style.setProperty("--year-marker-height", `${DEFAULT_MARKER_HEIGHT}px`);
      const markerHeights = [...yearElement.querySelectorAll(".trip-marker")].map((marker) => {
        return Math.max(marker.getBoundingClientRect().height, marker.scrollHeight);
      }).filter(Number.isFinite);
      const maxHeight = Math.max(DEFAULT_MARKER_HEIGHT, ...markerHeights.map(Math.ceil));
      yearElement.style.setProperty("--year-marker-height", `${maxHeight}px`);
    }

    let resizeTimer;
    function handleResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(measureMarkers, RESIZE_DEBOUNCE_MS);
    }

    measureMarkers();
    window.addEventListener("resize", handleResize);
    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
    };
  }, [measurementKey]);

  return <div ref={yearRef} className={`timeline-year-row ${className}`.trim()}>{children}</div>;
}