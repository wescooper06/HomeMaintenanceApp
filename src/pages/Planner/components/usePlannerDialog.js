import { useEffect } from "react";

export default function usePlannerDialog(ref, onClose, selector) {
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    const firstFocus = selector ? dialog.querySelector(selector) : dialog;
    firstFocus?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
      if (event.key === "Tab") {
        const controls = [...dialog.querySelectorAll("button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href]")];
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
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [ref, onClose, selector]);
}
