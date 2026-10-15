'use client';

import { useState, useTransition } from 'react';
import { deleteRosterVersion, putRosterInUse } from '@/app/orders/actions';
import { formatShort, timestampDay } from '@/lib/dates';
import type { RosterVersionSummary } from '@/lib/roster-versions';

/**
 * The rosters on an order — Roster 1, Roster 2… — with the one in use marked.
 *
 * Shown once there's more than one, or when the only one came from a file
 * (so the original is a click away). Switching or deleting goes through the
 * server and then reloads whatever is showing the roster: the form holds its
 * rows in local state, so `afterChange` decides how it catches up.
 */
export function RosterVersions({
  orderId, versions, fileLinks, beforeChange, afterChange,
}: {
  orderId: string;
  versions: RosterVersionSummary[];
  /** Roster id → a signed link to the file it was read from. */
  fileLinks: Record<string, string>;
  /** Save anything pending on the roster in use before it stops being in use. */
  beforeChange?: () => Promise<void>;
  afterChange: () => void;
}) {
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (versions.length === 0 || (versions.length === 1 && !fileLinks[versions[0].id])) return null;

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      await beforeChange?.();
      const res = await action();
      if (res.ok) afterChange();
      else setError(res.error);
    });
  }

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-ppc-gold">Rosters on this order</p>
      <ul className="mt-2 divide-y divide-line/60">
        {[...versions].sort((a, b) => b.number - a.number).map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <span className="font-bold">{v.label}</span>
            {v.inUse && <span className="rounded bg-ppc-gold px-1.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-black">In use</span>}
            <span className="text-muted">
              {v.rows} player{v.rows === 1 ? '' : 's'}
              {v.note ? ` · ${v.note}` : ''}
              {v.createdAt ? ` · ${formatShort(timestampDay(v.createdAt))}` : ''}
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-3 text-xs font-semibold">
              {fileLinks[v.id] && (
                <a href={fileLinks[v.id]} target="_blank" rel="noreferrer" className="text-ppc-gold hover:underline">Original file</a>
              )}
              <a href={`/api/orders/${orderId}/roster.csv?roster=${encodeURIComponent(v.id)}`} className="text-ppc-gold hover:underline">CSV</a>
              {!v.inUse && (
                <button type="button" disabled={pending} className="text-ppc-gold hover:underline disabled:opacity-40"
                  onClick={() => run(() => putRosterInUse(orderId, v.id))}>
                  Use this one
                </button>
              )}
              {!v.inUse && (confirmDelete === v.id ? (
                <span className="flex items-center gap-2">
                  <span className="text-muted">Delete {v.label}?</span>
                  <button type="button" disabled={pending} className="text-red-300 hover:underline"
                    onClick={() => { setConfirmDelete(null); run(() => deleteRosterVersion(orderId, v.id)); }}>Yes, delete</button>
                  <button type="button" className="text-muted hover:underline" onClick={() => setConfirmDelete(null)}>No</button>
                </span>
              ) : (
                <button type="button" disabled={pending} className="text-muted hover:text-red-300 disabled:opacity-40" onClick={() => setConfirmDelete(v.id)}>Delete</button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {pending && <p className="mt-1 text-xs text-muted">Saving…</p>}
      {error && <p className="mt-1 text-xs font-semibold text-red-300">{error}</p>}
      <p className="mt-1 text-xs text-muted">
        Only the roster in use is on the share sheet, the factory sheet, the totals and the CSV. The others are kept until you delete them.
      </p>
    </div>
  );
}
