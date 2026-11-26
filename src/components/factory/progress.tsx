'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setFactoryFinishDate, setFactoryStep } from '@/app/factory/actions';
import { FACTORY_STEPS, FACTORY_STEP_LABEL, isGated, type FactoryState, type FactoryStep } from '@/lib/factory/steps';
import { FACTORY_TEXT as T } from '@/lib/factory/text';

/**
 * "Where it's at" on a job page: six steps, the factory's own finish date,
 * and the tracking number when it ships.
 *
 * Tapping a step asks once ("Move to Prepping?") so a stray click never moves
 * a job — every move alerts Powerplay. Completed and Shipped say up front
 * that Powerplay approves them; Shipped asks for the tracking number first.
 * After any change the page is re-read from the server, so what's shown is
 * always what was saved, never a guess.
 */
export function FactoryProgress({ orderId, state, neededBy }: { orderId: string; state: FactoryState; neededBy: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState<FactoryStep | null>(null);
  const [tracking, setTracking] = useState('');
  const [date, setDate] = useState(state.finishDate);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const reachedIndex = state.step ? FACTORY_STEPS.indexOf(state.step) : -1;

  function confirmStep() {
    if (!choice) return;
    const step = choice;
    setError(null);
    setSaved(null);
    start(async () => {
      const r = await setFactoryStep(orderId, step, tracking);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setChoice(null);
      setTracking('');
      setSaved(isGated(step) ? `Sent to Powerplay to approve ${FACTORY_STEP_LABEL[step]}.` : `Moved to ${FACTORY_STEP_LABEL[step]}. Powerplay has been told.`);
      router.refresh();
    });
  }

  function saveDate() {
    if (date === state.finishDate) return;
    setError(null);
    setSaved(null);
    start(async () => {
      const r = await setFactoryFinishDate(orderId, date);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(date ? 'Finish date saved.' : 'Finish date cleared.');
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-ppc-gold/50 bg-surface p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ppc-gold">{T.progress}</h2>

      <ol className="mt-3 grid grid-cols-2 gap-1.5">
        {FACTORY_STEPS.map((s, i) => {
          const now = state.step === s;
          const done = i < reachedIndex;
          const waiting = state.pending?.step === s;
          return (
            <li key={s}>
              <button
                type="button"
                disabled={pending || now || waiting}
                aria-current={now ? 'step' : undefined}
                onClick={() => {
                  setChoice(s);
                  setError(null);
                  setSaved(null);
                }}
                className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm font-semibold transition-colors disabled:cursor-default ${
                  now
                    ? 'border-ppc-gold bg-ppc-gold text-black'
                    : waiting
                      ? 'border-amber-400 bg-amber-400/10 text-amber-200'
                      : done
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:border-ppc-gold/60'
                        : 'border-line bg-surface-2 text-muted hover:border-ppc-gold/60 hover:text-foreground'
                }`}
              >
                <span className="tabular-nums opacity-70">{i + 1}</span>
                <span className="min-w-0 flex-1">{FACTORY_STEP_LABEL[s]}</span>
                {done && <span aria-hidden>✓</span>}
                {waiting && <span className="text-[0.65rem] font-bold uppercase">waiting</span>}
              </button>
            </li>
          );
        })}
      </ol>

      {state.pending && (
        <p className="mt-3 rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          <span className="font-bold">{FACTORY_STEP_LABEL[state.pending.step]}</span> — waiting for Powerplay to approve
          {state.pending.tracking ? ` · tracking ${state.pending.tracking}` : ''}. Sent by {state.pending.by}.
        </p>
      )}
      {!state.step && !state.pending && (
        <p className="mt-3 text-xs text-muted">New job. Tap <span className="font-semibold text-foreground">Received</span> once you have it.</p>
      )}

      {choice && (
        <div className="mt-3 rounded-lg border border-ppc-gold/60 bg-ppc-gold/[0.06] p-3">
          <p className="text-sm font-semibold">
            {isGated(choice) ? `Mark this job ${FACTORY_STEP_LABEL[choice]}?` : `Move this job to ${FACTORY_STEP_LABEL[choice]}?`}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {isGated(choice)
              ? 'Powerplay approves this one before it counts. They are told right away.'
              : 'Powerplay is told right away.'}
          </p>
          {choice === 'shipped' && (
            <label className="mt-2 block text-xs font-medium text-muted">
              {T.tracking}
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                maxLength={60}
                placeholder="e.g. 1Z999AA10123456784"
                className="mt-1"
              />
            </label>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={confirmStep}
              className="rounded-lg bg-ppc-gold px-3.5 py-1.5 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50"
            >
              {pending ? 'Saving…' : isGated(choice) ? 'Yes, send for approval' : 'Yes, move it'}
            </button>
            <button type="button" disabled={pending} onClick={() => setChoice(null)} className="rounded-lg border border-line px-3.5 py-1.5 text-sm font-semibold text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 border-t border-line pt-3">
        <label className="block text-xs font-medium text-muted" htmlFor="factory-finish-date">
          {T.yourDate}
          <span className="mt-1 flex items-center gap-2">
            <input
              id="factory-finish-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="!w-auto"
            />
            <button
              type="button"
              disabled={pending || date === state.finishDate}
              onClick={saveDate}
              className="rounded-lg border border-line px-3 py-2 text-xs font-semibold hover:border-ppc-gold/60 disabled:opacity-40"
            >
              Save date
            </button>
          </span>
        </label>
        {neededBy && (
          <p className="text-xs text-muted">
            {T.due}: <span className="font-semibold text-foreground">{neededBy}</span>
          </p>
        )}
      </div>

      <p aria-live="polite" className="mt-2 min-h-4 text-xs">
        {error && <span className="font-semibold text-red-300">{error}</span>}
        {saved && !error && <span className="font-semibold text-emerald-300">{saved}</span>}
      </p>
    </div>
  );
}
