import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/** Share step navigation between the sidebar, page tabs and browser history. */
export function useModuleStep(count: number) {
  const [search, setSearch] = useSearchParams();
  const raw = search.get("step");
  const value = Number(raw);
  const explicit = raw !== null && Number.isInteger(value) && value >= 1 && value <= count;
  const step = explicit ? value : 1;
  const setStep = useCallback(
    (next: number) => {
      if (!Number.isInteger(next) || next < 1 || next > count) return;
      setSearch((previous) => {
        const updated = new URLSearchParams(previous);
        updated.set("step", String(next));
        return updated;
      });
    },
    [count, setSearch],
  );
  return { step, setStep, explicit };
}
