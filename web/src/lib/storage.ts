"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** A value in local/session storage that re-renders on change and is null during SSR. */
export function useStoredValue(key: string, kind: "local" | "session" = "local") {
  const store = useCallback(() => (kind === "local" ? localStorage : sessionStorage), [kind]);
  const value = useSyncExternalStore(subscribe, () => store().getItem(key), () => null);
  const set = useCallback(
    (next: string | null) => {
      if (next === null) store().removeItem(key);
      else store().setItem(key, next);
      listeners.forEach((fn) => fn());
    },
    [key, store],
  );
  return [value, set] as const;
}
