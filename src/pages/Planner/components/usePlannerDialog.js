import { useEffect } from "react";

export default function usePlannerDialog(ref, onClose, selector, { isolate = false, returnFocusId = "" } = {}) {
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    const root = isolate ? document.getElementById("root") : null;
    const previousInert = root?.inert;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    if (root) {
      root.inert = true;
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbar > 0 && !getComputedStyle(document.documentElement).scrollbarGutter.includes("stable")) {
        document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
      }
      document.body.style.overflow = "hidden";
    }
    const firstFocus = selector ? dialog.querySelector(selector) : dialog;
    firstFocus?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (event.target.matches?.("[data-planner-inline-edit], [data-checklist-dragging='true']")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
      if (event.key === "Tab") {
        const controls = [...dialog.querySelectorAll("button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href]")]
          .filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    const cancel = () => onClose();
    window.addEventListener("hashchange", cancel);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("hashchange", cancel);
      if (root) {
        root.inert = previousInert;
        document.body.style.overflow = previousOverflow;
        document.body.style.paddingRight = previousPadding;
      }
      const origin = returnFocusId ? document.getElementById(returnFocusId) : previousFocus;
      if (origin?.isConnected && !origin.closest("[inert]")) origin.focus();
      else if (isolate) document.querySelector('[data-role="planner-focus-fallback"]')?.focus();
    };
  }, [ref, onClose, selector, isolate, returnFocusId]);
}
