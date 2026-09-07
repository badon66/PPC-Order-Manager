'use client';

import { useCallback, useEffect, useState } from 'react';

const SESSION_KEY = (listId: string) => `ppc.callSession.${listId}`;

/** Ticks every `ms`. */
export function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Seconds since `iso`; 0 when null. */
export function useElapsedSince(iso: string | null): number {
  const now = useNow(1000);
  if (!iso) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
}

/**
 * "Calling for h:mm:ss" — starts when the view mounts if no start is stored,
 * survives refresh (sessionStorage), cleared by the back link.
 */
export function useSessionTimer(listId: string): { seconds: number; clear: () => void } {
  const [startedAt, setStartedAt] = useState<string | null>(null);
  useEffect(() => {
    try {
      const existing = sessionStorage.getItem(SESSION_KEY(listId));
      if (existing) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- seeding the session start from sessionStorage must happen after mount (hydration-safe), not in a lazy initializer
        setStartedAt(existing);
        return;
      }
      const now = new Date().toISOString();
      sessionStorage.setItem(SESSION_KEY(listId), now);
      setStartedAt(now);
    } catch {
      setStartedAt(new Date().toISOString());
    }
  }, [listId]);
  const seconds = useElapsedSince(startedAt);
  const clear = useCallback(() => { try { sessionStorage.removeItem(SESSION_KEY(listId)); } catch { /* ignore */ } }, [listId]);
  return { seconds, clear };
}

export function formatClock(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
