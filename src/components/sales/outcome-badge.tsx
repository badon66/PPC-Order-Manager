import type { CallOutcome } from '@/lib/types';
import { CALL_OUTCOME_META } from '@/lib/constants';

/** No 'use client' — rendered from server pages and from the client call view alike. */
export function OutcomeBadge({ outcome, size = 'sm' }: { outcome: CallOutcome | null; size?: 'sm' | 'lg' }) {
  if (!outcome) return <span className="text-xs text-muted">Not called</span>;
  const m = CALL_OUTCOME_META[outcome];
  const pad = size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold ${pad} ${m.className}`}>
      <span aria-hidden>{m.emoji}</span>
      {m.label}
    </span>
  );
}
