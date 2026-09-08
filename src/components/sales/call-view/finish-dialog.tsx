'use client';

import { useEffect, useRef } from 'react';
import type { CallLog, Contact } from '@/lib/types';
import type { CalendarDate } from '@/lib/dates';
import { formatTimestamp } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import { OutcomePanel } from './outcome-panel';
import type { CallDraft } from './use-draft';
import type { SaveState } from './footer-bar';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * The after-call survey, as a popup: rating, outcome, the outcome's prompt,
 * then Save. It edits the same draft as the page, so cancelling keeps every
 * choice and reopening shows it. Esc cancels; Tab cycles inside the panel.
 */
export function FinishDialog({
  open, contact, draft, onChange, editing, errors, warnings, missing, canSave, saveState, error, saveLabel, onCancel, onSave, today,
}: {
  open: boolean;
  contact: Contact;
  draft: CallDraft;
  onChange: (p: Partial<CallDraft>) => void;
  editing: CallLog | null;
  errors: Record<string, string>;
  warnings: Record<string, string>;
  missing: string | null;
  canSave: boolean;
  saveState: SaveState;
  error: string | null;
  saveLabel: string;
  onCancel: () => void;
  onSave: () => void;
  today: CalendarDate;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.stopPropagation(); onCancel(); return; }
    if (e.key !== 'Tab' || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="w-full max-w-3xl rounded-xl border border-line bg-surface p-5 shadow-2xl outline-none"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="finish-title" className="text-lg font-bold">{editing ? 'Edit this call' : 'How did the call go?'}</h2>
            <p className="text-sm text-muted">
              {contact.contactName || contact.orgName || 'This contact'}
              {editing && <> — logged {formatTimestamp(editing.endedAt, BUSINESS_TIMEZONE)}; saving replaces it</>}
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:border-ppc-gold/60 hover:text-ppc-gold">✕</button>
        </div>

        <OutcomePanel draft={draft} onChange={onChange} contact={contact} today={today} disabled={false} errors={errors} warnings={warnings} />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <span className={`text-sm ${saveState === 'error' ? 'text-red-300' : 'text-muted'}`}>
            {saveState === 'saving' ? 'Saving…' : error ?? (canSave ? '' : missing ?? '')}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm font-semibold hover:border-ppc-gold/60">Cancel</button>
            <button
              type="button"
              disabled={!canSave || saveState === 'saving'}
              onClick={onSave}
              title="Ctrl+Enter"
              className="rounded-lg bg-ppc-gold px-5 py-2.5 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-40"
            >
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
