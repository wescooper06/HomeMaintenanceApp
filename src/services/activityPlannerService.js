import { useCallback, useEffect, useRef, useState } from "react";
import {
  getActivityTypes, getActivityRules, getWeeklyGrid,
  createActivityRule, updateActivityRule, deleteActivityRule, splitRule,
} from "./activityDataAccess.js";
export { regenerateWeeklyGrid } from "./activityDataAccess.js";

export function useActivityData() {
  const [data, setData] = useState({ activityTypes: [], rules: [], weeklyGrid: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requests = useRef({ generation: 0 });

  const load = useCallback(() => {
    const state = requests.current;
    const current = ++state.generation;
    return Promise.all([getActivityTypes(), getActivityRules(), getWeeklyGrid()])
      .then(([activityTypes, rules, weeklyGrid]) => {
        if (current === state.generation) {
          setData({ activityTypes, rules, weeklyGrid });
          setError("");
        }
      }).catch((error) => {
        if (current === state.generation) setError(error.message);
      }).finally(() => {
        if (current === state.generation) setLoading(false);
      });
  }, []);

  useEffect(() => {
    const state = requests.current;
    load();
    return () => { state.generation++; };
  }, [load]);

  const reload = useCallback(() => {
    setLoading(true);
    return load();
  }, [load]);

  return { ...data, loading, error, reload,
    addRule: createActivityRule,
    updateRule: (rule) => updateActivityRule(rule.id, rule),
    splitRule, deleteRule: deleteActivityRule };
}
