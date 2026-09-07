'use client';

import { useEffect, useState } from 'react';

const KEY = 'ppc.callerName';

/**
 * Who is on the phone. There is no per-person login yet, so the name is a
 * per-device preference stamped on every call log. Defaults to the access
 * code holder's name.
 *
 * The stored name is applied in an effect, after mount, on purpose: the server
 * and the first client render must agree on the fallback, or React skips
 * patching the input's value during hydration and the field shows a stale
 * name. A lazy useState initializer that reads localStorage has exactly that
 * bug, which is why the lint rule below is silenced rather than obeyed.
 */
export function useCallerName(fallback: string): [string, (v: string) => void] {
  const [name, setName] = useState(fallback);
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from browser storage after hydration is the hydration-safe pattern
      if (v && v.trim()) setName(v);
    } catch { /* private mode etc. — keep the fallback */ }
  }, []);
  const set = (v: string) => {
    setName(v);
    try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
  };
  return [name, set];
}
