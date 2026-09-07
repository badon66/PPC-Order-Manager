'use client';

import { useState } from 'react';

const KEY = 'ppc.callerName';

function readStored(fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = localStorage.getItem(KEY);
    return v && v.trim() ? v : fallback;
  } catch {
    return fallback; // private mode etc. — keep the fallback
  }
}

/**
 * Who is on the phone. There is no per-person login yet, so the name is a
 * per-device preference stamped on every call log. Defaults to the access
 * code holder's name.
 *
 * Reads localStorage via a lazy `useState` initializer rather than an effect:
 * an effect-based sync would call `setState` on mount (flagged by
 * react-hooks/set-state-in-effect) purely to replace a value that's only
 * used as a controlled <input> value — React doesn't hydration-check that
 * attribute, so there's no server/client mismatch to guard against here.
 */
export function useCallerName(fallback: string): [string, (v: string) => void] {
  const [name, setName] = useState(() => readStored(fallback));
  const set = (v: string) => {
    setName(v);
    try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
  };
  return [name, set];
}
