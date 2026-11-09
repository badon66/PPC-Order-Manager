import type { ChangeLogEntry } from './types';

/**
 * Notes pinned on the sheets (Keenan, 2026-11-09).
 *
 * The team (on /share) and the factory (on /factory) press "Comment", click
 * anything on the page — a photo, a word, a roster row, a field — and leave a
 * note on it. Keenan sees every note on the order page and archives it once
 * it's handled. Notes never change the order.
 *
 * STORED AS HISTORY, NOT ON THE ORDER. A note is an append-only change-log
 * entry (`page_note`, carrying the note), and archiving is another entry
 * (`page_note_archived` / `page_note_restored`, `field` = the note's id). The
 * order row is read-modify-written by the form's autosave and by accepting a
 * submission; a note written onto it from the customer's page in the same
 * moment would be silently lost. History is insert-only, so nothing is.
 *
 * Who sees what: the team sees the team's notes on its own sheet, the factory
 * the factory's; neither ever sees the other's. Keenan sees both.
 */

export type NoteFrom = 'team' | 'factory';

export interface NoteAnchor {
  /** What was clicked, as the page marks it (`asset:<id>`, `roster:<id>`, `field:Jersey Type`…). '' when nothing marked. */
  key: string;
  /** That thing in words: "Roster: #12 Smith", "Main Crest", "Jersey Type". */
  label: string;
  /** The section of the sheet it's in: "Player Roster". */
  section: string;
  /** The words they highlighted, or the text they clicked. */
  quote: string;
}

export interface PageNote {
  id: string;
  from: NoteFrom;
  where: NoteAnchor;
  text: string;
  at: string;
  /** When Keenan archived it; null while it's open. */
  archivedAt: string | null;
}

export const NOTE_MAX_TEXT = 1000;
export const NOTE_MAX_LABEL = 160;
export const NOTE_MAX_QUOTE = 300;
/** Per order, per sheet. A real team leaves a handful; this only stops a runaway page. */
export const NOTE_MAX_PER_SHEET = 200;

const clip = (v: unknown, max: number) =>
  (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, max);

/** What a page sent, made safe to store: strings only, trimmed, capped. Null when there's no note. */
export function cleanNoteInput(raw: unknown): { where: NoteAnchor; text: string } | null {
  const r = (raw ?? {}) as { text?: unknown; where?: Record<string, unknown> };
  const text = (typeof r.text === 'string' ? r.text : '').trim().slice(0, NOTE_MAX_TEXT);
  if (!text) return null;
  const w = r.where ?? {};
  const key = clip(w.key, 120);
  return {
    text,
    where: {
      // Only the shapes the sheets mark; anything else is dropped rather than stored.
      key: /^(section|field|roster|asset|spare|item):[\w .:#&'/()+-]{0,110}$/.test(key) ? key : '',
      label: clip(w.label, NOTE_MAX_LABEL),
      section: clip(w.section, 80),
      quote: clip(w.quote, NOTE_MAX_QUOTE),
    },
  };
}

/** Every note on an order, oldest first, with its archived state applied. */
export function pageNotesOf(history: ChangeLogEntry[]): PageNote[] {
  const ordered = [...history].sort((a, b) => a.at.localeCompare(b.at));
  const notes = new Map<string, PageNote>();
  for (const h of ordered) {
    if (h.action === 'page_note' && h.note) {
      notes.set(h.note.id, { ...h.note, archivedAt: null });
    } else if (h.action === 'page_note_archived' && h.field && notes.has(h.field)) {
      notes.get(h.field)!.archivedAt = h.at;
    } else if (h.action === 'page_note_restored' && h.field && notes.has(h.field)) {
      notes.get(h.field)!.archivedAt = null;
    }
  }
  return [...notes.values()];
}

export const NOTE_ACTIONS = ['page_note', 'page_note_archived', 'page_note_restored'] as const;

/** Open notes per order, for the board's badge. */
export function openNoteCounts(entries: ChangeLogEntry[]): Record<string, number> {
  const byOrder = new Map<string, ChangeLogEntry[]>();
  for (const e of entries) {
    const list = byOrder.get(e.orderId);
    if (list) list.push(e);
    else byOrder.set(e.orderId, [e]);
  }
  const out: Record<string, number> = {};
  for (const [orderId, list] of byOrder) {
    const open = pageNotesOf(list).filter((n) => !n.archivedAt).length;
    if (open) out[orderId] = open;
  }
  return out;
}

export const NOTE_FROM_LABEL: Record<NoteFrom, string> = { team: 'The team', factory: 'The factory' };
