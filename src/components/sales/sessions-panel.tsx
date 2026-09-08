import Link from 'next/link';
import type { CallLog, CallSession, Contact } from '@/lib/types';
import { formatTimestamp } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import { sessionEnd, sessionTallyFor } from '@/lib/data/sales-logic';
import { OutcomeBadge } from './outcome-badge';

/** A session with no recorded end is "in progress" for this long, then it is shown as ended at its last call. */
const OPEN_WINDOW_MS = 12 * 60 * 60 * 1000;

function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE, hour: 'numeric', minute: '2-digit' }).format(d);
}

function minutesBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
}

/**
 * The session log: one line per calling session (newest first), each opening
 * to the contacts it touched with a time and outcome. No 'use client' — the
 * list page renders it on the server; the whole thing is one <details>.
 */
export function SessionsPanel({
  sessions, logs, contacts, listId, now,
}: { sessions: CallSession[]; logs: CallLog[]; contacts: Contact[]; listId: string; now: string }) {
  if (sessions.length === 0) return null;
  const byId = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const nowMs = new Date(now).getTime();

  return (
    <details className="rounded-xl border border-line bg-surface p-4">
      <summary className="cursor-pointer text-sm font-bold uppercase tracking-wide text-ppc-gold">
        Sessions <span className="ml-1 text-muted">{sessions.length}</span>
      </summary>
      <ol className="mt-3 space-y-2">
        {sessions.map((s) => {
          const mine = logs.filter((g) => g.sessionId === s.id).sort((a, b) => a.endedAt.localeCompare(b.endedAt));
          const open = !s.endedAt && nowMs - new Date(s.startedAt).getTime() < OPEN_WINDOW_MS;
          const end = open ? now : sessionEnd(s, logs);
          const t = sessionTallyFor(logs, s.id);
          const touched = new Set(mine.map((g) => g.contactId)).size;
          return (
            <li key={s.id}>
              <details className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm" open={open}>
                <summary className="cursor-pointer">
                  <span className="inline-flex w-[calc(100%-1.25rem)] flex-wrap items-center justify-between gap-x-3 gap-y-1 align-top">
                    <span>
                      <b>{formatTimestamp(s.startedAt, BUSINESS_TIMEZONE)}</b>
                      {' – '}{open ? <span className="text-ppc-gold">in progress</span> : timeOf(end)}
                      <span className="text-muted"> · {s.callerName || '—'}</span>
                    </span>
                    <span className="text-xs tabular-nums text-muted">
                      {minutesBetween(s.startedAt, end)} min · {t.calls} call{t.calls === 1 ? '' : 's'} · {touched} contact{touched === 1 ? '' : 's'} · {t.reached} reached
                    </span>
                  </span>
                </summary>
                {mine.length === 0 ? (
                  <p className="mt-2 text-xs text-muted">No calls logged in this session.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line">
                    {mine.map((g) => {
                      const c = byId[g.contactId];
                      return (
                        <li key={g.id} className="flex items-center justify-between gap-3 py-1.5">
                          <span className="min-w-0 truncate text-xs">
                            <span className="tabular-nums text-muted">{timeOf(g.endedAt)}</span>
                            {' · '}
                            <Link href={`/sales/${listId}/contacts/${g.contactId}`} className="font-semibold hover:text-ppc-gold">
                              {c ? (c.contactName || c.orgName || '—') : 'Removed contact'}
                            </Link>
                            {c?.contactName && c.orgName ? <span className="text-muted"> · {c.orgName}</span> : null}
                          </span>
                          <OutcomeBadge outcome={g.outcome} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </details>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
