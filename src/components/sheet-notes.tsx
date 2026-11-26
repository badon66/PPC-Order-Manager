'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteAnchor, PageNote } from '@/lib/page-notes';
import { NOTE_MAX_TEXT } from '@/lib/page-notes';

/**
 * "Comment" on a sheet (Keenan, 2026-11-09).
 *
 * Press Comment (top-right), then click anything on the page — a photo, a
 * word, a roster row, a field, a whole section — and type a note. Highlight
 * some words first and the note quotes exactly those. Keenan sees every note
 * on the order page (and gets an email); the sheet shows its own notes back,
 * marked on what they're pinned to.
 *
 * What a click is pinned to comes from the page's own marks
 * (`data-note-key` / `data-note-label` on sections, fields, roster rows and
 * artwork tiles — ui.tsx, build-sheet.tsx, artwork-gallery.tsx). Anything
 * unmarked still works: it pins to its section and quotes the words clicked.
 *
 * Nothing here changes the order. `save` is the sheet's server action, bound
 * to its token.
 */

type Save = (input: { where: NoteAnchor; text: string }) => Promise<{ ok: boolean; note?: PageNote; error?: string }>;

const UI = '[data-notes-ui]';

function anchorFor(target: HTMLElement): NoteAnchor {
  const keyed = target.closest<HTMLElement>('[data-note-key]');
  const section = target.closest<HTMLElement>('[data-note-section]')?.dataset.noteSection ?? '';
  const selected = window.getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? '';
  let quote = selected;
  if (!quote) {
    if (target instanceof HTMLImageElement) quote = target.alt || 'Photo';
    else {
      const t = (target.innerText ?? '').replace(/\s+/g, ' ').trim();
      quote = t.length <= 160 ? t : '';
    }
  }
  const label = keyed?.dataset.noteLabel ?? (quote.slice(0, 60) || section);
  return { key: keyed?.dataset.noteKey ?? '', label, section, quote: quote === label ? '' : quote };
}

function findMarked(key: string): HTMLElement | null {
  if (!key) return null;
  try {
    return document.querySelector<HTMLElement>(`[data-note-key="${CSS.escape(key)}"]`);
  } catch {
    return null;
  }
}

export function SheetNotes({ initial, save, who }: { initial: PageNote[]; save: Save; who: 'team' | 'factory' }) {
  const [notes, setNotes] = useState<PageNote[]>(initial);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<{ where: NoteAnchor; x: number; y: number } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const hovered = useRef<HTMLElement | null>(null);

  const clearHover = () => {
    hovered.current?.classList.remove('ppc-note-hover');
    hovered.current = null;
  };

  // Comment mode: outline what a click would pin to, and catch the click.
  useEffect(() => {
    if (!picking) return;
    document.body.classList.add('ppc-note-picking');
    const over = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(UI)) return clearHover();
      // ONE box, and the same one a click pins to (`anchorFor`): the nearest marked
      // thing — a tile, a chip, a number box, a field, a roster row — else its
      // section. A picture inside a marked tile outlines the tile, never a
      // second box inside it. Only something outside every mark outlines itself.
      const el = t.closest<HTMLElement>('[data-note-key]') ?? t;
      if (el === hovered.current) return;
      clearHover();
      el.classList.add('ppc-note-hover');
      hovered.current = el;
    };
    const click = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(UI)) return;
      e.preventDefault();
      e.stopPropagation();
      clearHover();
      setDraft({ where: anchorFor(t), x: e.clientX, y: e.clientY });
      setText('');
      setError(null);
      setPicking(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(false);
    document.addEventListener('mouseover', over, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key);
    return () => {
      document.body.classList.remove('ppc-note-picking');
      clearHover();
      document.removeEventListener('mouseover', over, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key);
    };
  }, [picking]);

  // Mark what each open note is pinned to.
  useEffect(() => {
    document.querySelectorAll('[data-noted]').forEach((el) => el.removeAttribute('data-noted'));
    const count = new Map<string, number>();
    for (const n of notes) if (!n.archivedAt && n.where.key) count.set(n.where.key, (count.get(n.where.key) ?? 0) + 1);
    for (const [k, c] of count) findMarked(k)?.setAttribute('data-noted', String(c));
  }, [notes]);

  const jumpTo = useCallback((n: PageNote) => {
    const el = findMarked(n.where.key);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ppc-note-flash');
    setTimeout(() => el.classList.remove('ppc-note-flash'), 1600);
  }, []);

  async function submit() {
    if (!draft || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await save({ where: draft.where, text });
      if (!r.ok || !r.note) throw new Error(r.error ?? 'Could not save that note.');
      setNotes((list) => [...list, r.note!]);
      setDraft(null);
      setText('');
      setListOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const open = notes.filter((n) => !n.archivedAt).length;
  // The note box sits by the click, kept on screen.
  const box = draft
    ? {
        left: Math.max(12, Math.min(draft.x - 160, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 340)),
        top: Math.max(72, Math.min(draft.y + 12, (typeof window !== 'undefined' ? window.innerHeight : 800) - 280)),
      }
    : null;

  return (
    <div data-notes-ui>
      {/*
        * Bottom-right, always there — like a chat button. At the top it sat
        * over the team name and the factory's Sign out on a phone.
        */}
      <div className="fixed bottom-4 right-3 z-50 flex flex-col-reverse items-end gap-2 print:hidden">
        <div className="flex gap-2">
          {notes.length > 0 && (
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              className="rounded-full border border-line bg-surface px-3 py-2 text-xs font-semibold shadow-lg hover:border-ppc-gold/60"
            >
              Your notes ({notes.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              setPicking((v) => !v);
            }}
            aria-pressed={picking}
            className={`rounded-full px-4 py-2 text-sm font-bold shadow-lg ${
              picking ? 'bg-surface text-ppc-gold ring-2 ring-ppc-gold' : 'bg-ppc-gold text-black hover:bg-ppc-gold-dim'
            }`}
          >
            {picking ? 'Cancel' : '💬 Comment'}
          </button>
        </div>
        {picking && (
          <p className="max-w-xs rounded-lg border border-ppc-gold/50 bg-surface px-3 py-2 text-xs shadow-lg">
            Click anything on the page — a photo, a name, a size, a section — to leave a note on it. Highlight
            words first to quote exactly those. Esc to stop.
          </p>
        )}
        {listOpen && notes.length > 0 && (
          <div className="max-h-[60vh] w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-line bg-surface p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-ppc-gold">
                {who === 'team' ? 'Your notes to Powerplay' : 'Notes to Powerplay'}
              </span>
              <button type="button" onClick={() => setListOpen(false)} className="text-xs text-muted hover:text-ppc-gold">
                ✕
              </button>
            </div>
            <ul className="space-y-2">
              {[...notes].reverse().map((n) => (
                <li key={n.id} className={`rounded-lg border border-line p-2 text-sm ${n.archivedAt ? 'opacity-60' : ''}`}>
                  <button type="button" onClick={() => jumpTo(n)} className="block text-left text-xs font-semibold text-ppc-gold hover:underline">
                    {n.where.label || n.where.section || 'The sheet'}
                  </button>
                  {n.where.quote && <p className="mt-0.5 text-xs italic text-muted">“{n.where.quote}”</p>}
                  <p className="mt-1 whitespace-pre-wrap">{n.text}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    {new Date(n.at).toLocaleDateString()} · {n.archivedAt ? 'Seen by Powerplay ✓' : 'Sent to Powerplay'}
                  </p>
                </li>
              ))}
            </ul>
            {open === 0 && <p className="mt-2 text-xs text-muted">Everything here has been seen.</p>}
          </div>
        )}
      </div>

      {draft && box && (
        <div
          role="dialog"
          aria-label="Leave a note"
          className="fixed z-[60] w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-ppc-gold/60 bg-surface p-3 shadow-2xl"
          style={{ left: box.left, top: box.top }}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-ppc-gold">Note on</p>
          <p className="text-sm font-semibold">{draft.where.label || draft.where.section || 'This part of the sheet'}</p>
          {draft.where.quote && <p className="mt-0.5 line-clamp-3 text-xs italic text-muted">“{draft.where.quote}”</p>}
          <textarea
            autoFocus
            rows={4}
            maxLength={NOTE_MAX_TEXT}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
              if (e.key === 'Escape') setDraft(null);
            }}
            placeholder={who === 'team' ? 'e.g. This should be #17, not #71' : 'e.g. Need the vector file for this logo'}
            className="mt-2 w-full"
          />
          {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="text-xs font-semibold text-muted hover:text-ppc-gold">
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={submit}
              className="rounded-lg bg-ppc-gold px-3 py-1.5 text-sm font-semibold text-black hover:bg-ppc-gold-dim disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send note'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
