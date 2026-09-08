import type { CallLog, CallSession, Contact, ScriptItem } from '@/lib/types';
import { formatTimestamp } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import { fillPlaceholders } from '@/lib/sales/script';
import { OutcomeBadge } from '../outcome-badge';
import { StarRating } from '../star-rating';

export function CallHistory({
  contact, logs, script, sessionsById = {},
}: { contact: Contact; logs: CallLog[]; script: ScriptItem[]; sessionsById?: Record<string, CallSession> }) {
  if (logs.length === 0) return <p className="text-sm text-muted">No calls yet.</p>;
  // Question labels read as they did on the call: placeholders filled for this contact and that call's caller.
  const label = (id: string, callerName: string) => {
    const item = script.find((s) => s.id === id);
    return item ? fillPlaceholders(item.text, contact, callerName) : id;
  };
  const managerLine = (g: CallLog) => {
    const jm = g.jerseyManager;
    if (jm.answer === 'self') return 'Handles the jerseys themselves';
    if (jm.answer === 'other') return `Jerseys handled by ${jm.person.name.trim() || (jm.existingContactId ? 'another contact at this team' : 'someone else')}`;
    return null;
  };
  return (
    <ol className="space-y-3">
      {logs.map((g) => {
        const session = g.sessionId ? sessionsById[g.sessionId] : undefined;
        const manager = managerLine(g);
        return (
          <li key={g.id} className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted">
                {formatTimestamp(g.endedAt, BUSINESS_TIMEZONE)} · {g.callerName || '—'} · {Math.round(g.durationSeconds / 60)} min
                {session && <> · session of {formatTimestamp(session.startedAt, BUSINESS_TIMEZONE)}</>}
              </span>
              <span className="flex items-center gap-2"><StarRating value={g.leadRating} /><OutcomeBadge outcome={g.outcome} /></span>
            </div>
            {g.followUp.date && <p className="mt-1 text-xs text-muted">Follow up {g.followUp.date}{g.followUp.time ? ` ${g.followUp.time}` : ''}{g.followUp.note ? ` — ${g.followUp.note}` : ''}</p>}
            {g.email && <p className="mt-1 text-xs text-muted">Email: {g.email}</p>}
            {g.reason && <p className="mt-1 text-xs text-muted">Reason: {g.reason}</p>}
            {(g.referral.name || g.referral.phone) && <p className="mt-1 text-xs text-muted">Referred to {g.referral.name}{g.referral.role ? ` (${g.referral.role})` : ''} {g.referral.phone}</p>}
            {manager && <p className="mt-1 text-xs text-muted">{manager}</p>}
            {g.newPhone && <p className="mt-1 text-xs text-muted">New number: {g.newPhone}</p>}
            {g.notes && <p className="mt-2 whitespace-pre-wrap">{g.notes}</p>}
            {Object.keys(g.answers).length > 0 && (
              <dl className="mt-2 space-y-1 text-xs">
                {Object.entries(g.answers).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}><dt className="inline text-muted">{label(k, g.callerName)} </dt><dd className="inline font-semibold">{v}</dd></div>
                ))}
              </dl>
            )}
          </li>
        );
      })}
    </ol>
  );
}
