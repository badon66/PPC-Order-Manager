import type { CallLog, ScriptItem } from '@/lib/types';
import { formatTimestamp } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import { OutcomeBadge } from '../outcome-badge';
import { StarRating } from '../star-rating';

export function CallHistory({ logs, script }: { logs: CallLog[]; script: ScriptItem[] }) {
  if (logs.length === 0) return <p className="text-sm text-muted">No calls yet.</p>;
  const label = (id: string) => script.find((s) => s.id === id)?.text ?? id;
  return (
    <ol className="space-y-3">
      {logs.map((g) => (
        <li key={g.id} className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted">{formatTimestamp(g.endedAt, BUSINESS_TIMEZONE)} · {g.callerName || '—'} · {Math.round(g.durationSeconds / 60)} min</span>
            <span className="flex items-center gap-2"><StarRating value={g.leadRating} /><OutcomeBadge outcome={g.outcome} /></span>
          </div>
          {g.followUp.date && <p className="mt-1 text-xs text-muted">Follow up {g.followUp.date}{g.followUp.time ? ` ${g.followUp.time}` : ''}{g.followUp.note ? ` — ${g.followUp.note}` : ''}</p>}
          {g.email && <p className="mt-1 text-xs text-muted">Email: {g.email}</p>}
          {g.reason && <p className="mt-1 text-xs text-muted">Reason: {g.reason}</p>}
          {(g.referral.name || g.referral.phone) && <p className="mt-1 text-xs text-muted">Referred to {g.referral.name}{g.referral.role ? ` (${g.referral.role})` : ''} {g.referral.phone}</p>}
          {g.newPhone && <p className="mt-1 text-xs text-muted">New number: {g.newPhone}</p>}
          {g.notes && <p className="mt-2 whitespace-pre-wrap">{g.notes}</p>}
          {Object.keys(g.answers).length > 0 && (
            <dl className="mt-2 space-y-1 text-xs">
              {Object.entries(g.answers).filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt className="inline text-muted">{label(k)} </dt><dd className="inline font-semibold">{v}</dd></div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ol>
  );
}
