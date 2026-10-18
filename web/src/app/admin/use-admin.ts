"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

export type AdminProps = { token: string; onUnauthorized: () => void };

/** Loads `path` for the admin and exposes a `call` helper that logs out on 401. */
export function useAdmin<T>(path: string, { token, onUnauthorized }: AdminProps) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");

  const call = useCallback(
    async <R,>(p: string, init: RequestInit = {}) => {
      try {
        const result = await api<R>(p, { ...init, token });
        setError("");
        return result;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) onUnauthorized();
        setError((e as Error).message);
        throw e;
      }
    },
    [token, onUnauthorized],
  );

  const reload = useCallback(() => call<T>(path).then(setData).catch(() => {}), [call, path]);

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- call() only sets state after its await
    call<T>(path)
      .then((d) => live && setData(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [call, path]);

  return { data, error, call, reload };
}
