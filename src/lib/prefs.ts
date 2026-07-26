import { useCallback, useEffect, useState } from "react";

const PLANNING_KEY = "cwb:helper-planning";

export function getPlanningEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(PLANNING_KEY) !== "off";
}

export function usePlanningEnabled() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(getPlanningEnabled());
  }, []);

  const update = useCallback((value: boolean) => {
    setEnabled(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PLANNING_KEY, value ? "on" : "off");
    }
  }, []);

  return { planningEnabled: enabled, setPlanningEnabled: update };
}
