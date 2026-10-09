import { useEffect, useRef } from "react";
import TripDetailsPanel from "./TripDetailsPanel.jsx";
import { resolveLinkTitle } from "../utils/resolveLinkTitle.js";

export default function ViewTripModal({ trip, onClose }) {
  const dialog = useRef(null);

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

  return (
    <dialog ref={dialog} className="capture-trip view-trip-modal" aria-labelledby="view-trip-title" aria-modal="true" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <TripDetailsPanel trip={trip} titleId="view-trip-title" resolveTitle={resolveLinkTitle}>
        <footer className="trip-modal-footer"><div className="capture-actions"><button type="button" className="button-secondary" onClick={() => onClose()}>Close</button></div></footer>
      </TripDetailsPanel>
    </dialog>
  );
}