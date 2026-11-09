'use client';

import { useState, useTransition } from 'react';
import { setSheetNoteArchived } from '@/app/orders/actions';
import { NOTE_FROM_LABEL, type PageNote } from '@/lib/page-notes';
import { formatTimestamp } from '@/lib/dates';

/**
 * Keenan's view of the notes pinned on this order's sheets — the team's and
 * the factory's, newest first. Archive one once it's handled; archived ones
 * fold away (and show as "Seen by Powerplay" on the sheet that sent them).
 * Each note links to the sheet, where it's marked on what it's about.
 */
export function SheetNotesInbox({
  orderId,
  notes,
  shareUrl,
  factoryUrl,
}: {
  orderId: string;
  notes: PageNote[];
  shareUrl: string | null;
  factoryUrl: string | null;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [pending, start] = useTransition();
  const newest = [...notes].sort((a, b) => b.at.localeCompare(a.at));
  const open = newest.filter((n) => !n.archivedAt);
  const archived = newest.filter((n) => n.archivedAt);

  const card = (n: PageNote) => {
    const url = n.from === 'team' ? shareUrl : factoryUrl;
    return (
      <li
        key={n.id}
        className={`rounded-lg border p-3 ${n.archivedAt ? 'border-line bg-surface-2/40 opacity-75' : 'border-ppc-gold/50 bg-ppc-gold/[0.05]'}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted">
              <span className={`font-bold ${n.from === 'team' ? 'text-sky-300' : 'text-amber-300'}`}>{NOTE_FROM_LABEL[n.from]}</span>
              {' · '}
              {formatTimestamp(n.at)}
            </p>
            <p className="mt-0.5 text-sm font-semibold">
              {[n.where.section, n.where.label].filter((x, i, a) => x && a.indexOf(x) === i).join(' › ') || 'The sheet'}
            </p>
            {n.where.quote && <p className="mt-0.5 text-xs italic text-muted">“{n.where.quote}”</p>}
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs">
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-ppc-gold hover:underline">
                See it on the sheet
              </a>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => setSheetNoteArchived(orderId, n.id, !n.archivedAt))}
              className="rounded border border-line px-2 py-1 font-semibold text-muted hover:border-ppc-gold/60 hover:text-ppc-gold disabled:opacity-50"
            >
              {n.archivedAt ? 'Bring back' : 'Archive'}
            </button>
          </div>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm">{n.text}</p>
      </li>
    );
  };

  if (notes.length === 0) {
    return (
      <p className="text-sm text-muted">
        No notes yet. The team and the factory can press <span className="font-semibold text-ppc-gold">Comment</span> on
        their sheet and pin a note on anything — a photo, a name, a size.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {open.length === 0 ? (
        <p className="text-sm text-muted">Nothing open — every note has been archived.</p>
      ) : (
        <ul className="space-y-2">{open.map(card)}</ul>
      )}
      {archived.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-xs font-semibold text-muted hover:text-ppc-gold">
            {showArchived ? '▾' : '▸'} {archived.length} archived
          </button>
          {showArchived && <ul className="mt-2 space-y-2">{archived.map(card)}</ul>}
        </div>
      )}
    </div>
  );
}
