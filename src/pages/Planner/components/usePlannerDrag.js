import { usePlanner } from "./usePlanner.js";

export default function usePlannerDrag() {
  const { snapshot, actions } = usePlanner();
  return {
    drag: snapshot.drag,
    dropTarget: snapshot.dropTarget,
    start(event, payload, effect = "move") {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = effect;
      event.dataTransfer.setData("text/plain", JSON.stringify(payload));
      actions.setDrag(payload);
    },
    end() { actions.setDrag(null); },
    target(event, key, effect = "move") {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = effect;
      if (snapshot.dropTarget !== key) actions.setDropTarget(key);
    },
    leave(event) {
      if (!event.currentTarget.contains(event.relatedTarget)) actions.setDropTarget("");
    },
  };
}
