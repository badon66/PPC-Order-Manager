'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ackFactoryActivity, approveFactoryStep, declineFactoryStep } from '@/app/orders/factory-admin-actions';
import { FACTORY_STEPS, FACTORY_STEP_LABEL, type FactoryActivity, type FactoryState } from '@/lib/factory/steps';
import { formatLong, formatTimestamp } from '@/lib/dates';

/**
 * Keenan's view of what the factory has done on one order: where they say
 * it's at, their finish date, every move they made — and, for Completed and
 * Shipped, the Approve button. Approving is what moves the ORDER (status,
 * production-finished date, tracking); until then the factory's page says
 * "waiting for Powerplay".
 */
export function FactoryAdminPanel({
  orderId,
  state,
  items,
  unread,
  jobUrl,
}: {
  orderId: string;
  state: FactoryState;
  items: FactoryActivity[];
  unread: number;
  /** The factory's page for this job, or null when the order isn't on their dashboard. */
  jobUrl: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const reached = state.step ? FACTORY_STEPS.indexOf(state.step) : -1;

  const run = (fn: () => Promise<{ ok: boolean; error?: string; moved?: string }>, done: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg({ text: r.error ?? 'That did not go through.', ok: false });
      else {
        setMsg({ text: done, ok: true });
        setDeclining(false);
        setReason('');
        router.refresh();
      }
    });

  if (!jobUrl) {
    return (
      <p className="text-sm text-muted">
        Not on the factory&apos;s dashboard yet. It appears there once you mark it <span className="font-semibold text-ppc-gold">Sent off to factory</span> (or it reaches In Production).
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {state.pending && (
        <div className="rounded-lg border-2 border-ppc-gold bg-ppc-gold/10 p-4">
          <p className="text-base font-bold">
            {state.pending.by} marked this job {FACTORY_STEP_LABEL[state.pending.step]}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {formatTimestamp(state.pending.at)}
            {state.pending.tracking ? ` · tracking ${state.pending.tracking}` : ''}
          </p>
          <p className="mt-2 text-sm">
            {state.pending.step === 'completed'
              ? 'Approving marks production finished and moves the order to Waiting for Final Approval.'
              : `Approving moves the order to Shipped${state.pending.tracking ? ' and saves the tracking number' : ''}.`}{' '}
            Emails to the customer are still offered to you, never sent on their own.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => approveFactoryStep(orderId, state.pending!.id), 'Approved.')}
              className="rounded-lg bg-ppc-gold px-4 py-2 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50"
            >
              {pending ? 'Working…' : `Approve ${FACTORY_STEP_LABEL[state.pending.step]}`}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setDeclining((v) => !v)}
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted hover:border-red-500/60 hover:text-red-300 disabled:opacity-50"
            >
              Not yet
            </button>
          </div>
          {declining && (
            <div className="mt-3">
              <label className="text-xs font-medium text-muted" htmlFor="factory-decline-reason">Why not? (the factory sees this)</label>
              <textarea id="factory-decline-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full" placeholder="e.g. Send the finished photos first." />
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => declineFactoryStep(orderId, state.pending!.id, reason), 'Sent back to the factory.')}
                className="mt-2 rounded-lg bg-red-500/80 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                Send it back
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <ol className="flex flex-wrap gap-1.5">
          {FACTORY_STEPS.map((s, i) => (
            <li
              key={s}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                state.step === s
                  ? 'border-ppc-gold bg-ppc-gold text-black'
                  : i < reached
                    ? 'border-emerald-500/50 text-emerald-300'
                    : 'border-line text-muted'
              }`}
            >
              {FACTORY_STEP_LABEL[s]}
            </li>
          ))}
        </ol>
        <p className="text-sm">
          <span className="text-muted">Factory expects to finish: </span>
          <span className="font-semibold">{state.finishDate ? formatLong(state.finishDate) : 'not set'}</span>
        </p>
        <a href={jobUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-ppc-gold hover:underline">
          See what the factory sees →
        </a>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">The factory hasn&apos;t touched this job yet.</p>
      ) : (
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted">Factory activity{unread > 0 ? ` · ${unread} new` : ''}</p>
            {unread > 0 && !state.pending && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => ackFactoryActivity(orderId), 'Cleared.')}
                className="rounded border border-line px-2 py-1 text-xs font-semibold text-muted hover:border-ppc-gold/60 hover:text-ppc-gold disabled:opacity-50"
              >
                Got it
              </button>
            )}
          </div>
          <ul className="divide-y divide-line/50 rounded-lg border border-line">
            {items.slice(0, 12).map((a) => {
              const isNew = a.needsApproval || !state.ackAt || a.at > state.ackAt;
              return (
                <li key={a.id} className={`flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm ${isNew ? 'bg-ppc-gold/[0.06]' : ''}`}>
                  <span>
                    {isNew && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-ppc-gold" aria-label="new" />}
                    <span className="font-semibold">{a.by}</span> · {a.text}
                    {a.needsApproval && <span className="ml-2 text-xs font-bold text-ppc-gold">needs your approval</span>}
                  </span>
                  <span className="text-xs text-muted">{formatTimestamp(a.at)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {msg && <p className={`text-sm font-semibold ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</p>}
    </div>
  );
}
