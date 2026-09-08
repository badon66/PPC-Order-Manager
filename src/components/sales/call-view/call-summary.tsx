'use client';

import type { CallLog } from '@/lib/types';
import { formatTimestamp } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import { OutcomeBadge } from '../outcome-badge';
import { StarRating } from '../star-rating';
import type { CallDraft } from './use-draft';

/**
 * The page's small "Call" card: what has been chosen so far, and the button
 * that opens the finish dialog. Once the call is logged (this session) it
 * shows the log and offers Edit instead.
 */
export function CallSummary({
  draft, logged, disabled, disabledReason, onOpen, onEdit,
}: {
  draft: CallDraft;
  logged: CallLog | null;
  disabled: boolean;
  disabledReason: string | null;
  onOpen: () => void;
  onEdit: () => void;
}) {
  if (logged) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 p-3 text-sm">
        <span className="flex flex-wrap items-center gap-2">
          Logged as <OutcomeBadge outcome={logged.outcome} />
          <span className="text-muted">{formatTimestamp(logged.endedAt, BUSINESS_TIMEZONE)}</span>
          {logged.leadRating && <StarRating value={logged.leadRating} />}
        </span>
        <button type="button" onClick={onEdit} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:border-ppc-gold/60 hover:text-ppc-gold">Edit</button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="flex flex-wrap items-center gap-2">
          {draft.outcome ? <OutcomeBadge outcome={draft.outcome} /> : <span className="text-muted">No outcome yet</span>}
          <StarRating value={draft.leadRating} />
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={onOpen}
          title="Ctrl+Enter"
          className="rounded-lg bg-ppc-gold px-4 py-2 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-40"
        >
          {draft.outcome ? 'Change…' : 'Call finished'}
        </button>
      </div>
      {disabled && disabledReason && <p className="text-xs text-red-300">{disabledReason}</p>}
      {!disabled && <p className="text-xs text-muted">Press an outcome key (1–9, 0, -) or Ctrl+Enter when the call is over.</p>}
    </div>
  );
}
