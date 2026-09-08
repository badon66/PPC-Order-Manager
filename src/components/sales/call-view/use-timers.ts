'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { endSession, startSession } from '@/app/sales/actions';

const SESSION_KEY = (listId: string) => `ppc.callSession.${listId}`;
/** Same key as use-caller-name.ts; read directly so the session gets the stored name on its first tick. */
const CALLER_NAME_KEY = 'ppc.callerName';

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

export interface StoredSession { id: string; startedAt: string }

/**
 * The calling session: a server-side CallSession row, remembered per list in
 * sessionStorage as `{ id, startedAt }` so a refresh keeps counting. On mount
 * an existing stored session is reused; otherwise one is started (which also
 * closes any session left open on the list). `end()` closes it — the back link
 * calls it. Closing the tab leaves it open; the list page shows it ended at
 * its last call.
 */
export function useCallSession(listId: string, callerFallback: string): { session: StoredSession | null; seconds: number; end: () => Promise<void> } {
  const [session, setSession] = useState<StoredSession | null>(null);
  const starting = useRef(false);

  useEffect(() => {
    let stored: StoredSession | null = null;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY(listId));
      // Older builds stored a bare ISO string here; anything that isn't our JSON shape is ignored.
      if (raw && raw.startsWith('{')) stored = JSON.parse(raw) as StoredSession;
    } catch { /* ignore */ }
    if (stored?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring the session from sessionStorage must happen after mount (hydration-safe)
      setSession(stored);
      return;
    }
    if (starting.current) return;
    starting.current = true;
    let callerName = callerFallback;
    try { callerName = localStorage.getItem(CALLER_NAME_KEY)?.trim() || callerFallback; } catch { /* ignore */ }
    startSession(listId, callerName)
      .then((r) => {
        if (!r.ok) return;
        const s = { id: r.session.id, startedAt: r.session.startedAt };
        try { sessionStorage.setItem(SESSION_KEY(listId), JSON.stringify(s)); } catch { /* ignore */ }
        setSession(s);
      })
      .finally(() => { starting.current = false; });
  }, [listId, callerFallback]);

  const seconds = useElapsedSince(session?.startedAt ?? null);

  const end = useCallback(async () => {
    try { sessionStorage.removeItem(SESSION_KEY(listId)); } catch { /* ignore */ }
    if (session) await endSession(listId, session.id).catch(() => undefined);
  }, [listId, session]);

  return { session, seconds, end };
}

export function formatClock(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
