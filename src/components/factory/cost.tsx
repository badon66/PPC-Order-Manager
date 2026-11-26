'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setFactoryCost } from '@/app/factory/actions';
import { centsToInput, usd, type JobMoney } from '@/lib/factory/money';
import { LocalTime } from './local-time';

/**
 * The factory's cost for this job, and what Powerplay has paid toward it.
 * US dollars only. One total for the job; a separate box for extra shipping
 * (shipping is otherwise included). Changing either tells Powerplay, with the
 * amount before and after. After a save the page is re-read from the server,
 * so the numbers shown are the ones stored.
 */
export function FactoryCost({ orderId, money }: { orderId: string; money: JobMoney }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cost, setCost] = useState(centsToInput(money.cost));
  const [shipping, setShipping] = useState(money.shipping ? centsToInput(money.shipping) : '');
  const [editing, setEditing] = useState(money.cost === null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function save() {
    setError(null);
    setSaved(null);
    start(async () => {
      const r = await setFactoryCost(orderId, cost, shipping);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      setSaved('Saved. Powerplay has been told.');
      router.refresh();
    });
  }

  const missing = money.cost === null;
  return (
    <section className={`rounded-xl border bg-surface p-3 ${missing ? 'border-2 border-ppc-gold' : 'border-line'}`}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-ppc-gold">Cost · US dollars</h2>

      {editing ? (
        <div className="mt-2 space-y-2">
          {missing && <p className="text-sm">Enter your total cost for this job.</p>}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="factory-cost">Total cost (USD)</label>
              <input id="factory-cost" type="text" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" className="mt-1 w-full" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted" htmlFor="factory-shipping">Extra shipping (USD)</label>
              <input id="factory-shipping" type="text" inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="included" className="mt-1 w-full" />
            </div>
          </div>
          <p className="text-xs text-muted">Shipping is included in the total. Use the second box only if you charge extra for it.</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={pending || !cost.trim()} onClick={save} className="rounded-lg bg-ppc-gold px-4 py-1.5 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50">
              {pending ? 'Saving…' : 'Save cost'}
            </button>
            {!missing && (
              <button type="button" disabled={pending} onClick={() => { setEditing(false); setCost(centsToInput(money.cost)); setShipping(money.shipping ? centsToInput(money.shipping) : ''); setError(null); }} className="text-xs font-semibold text-muted hover:text-ppc-gold">
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm tabular-nums">
            <dt className="text-muted">Cost</dt>
            <dd className="text-right font-semibold">{usd(money.cost ?? 0)}</dd>
            {money.shipping > 0 && (
              <>
                <dt className="text-muted">Extra shipping</dt>
                <dd className="text-right font-semibold">{usd(money.shipping)}</dd>
              </>
            )}
            <dt className="text-muted">Paid by Powerplay</dt>
            <dd className="text-right font-semibold text-emerald-300">{usd(money.paid)}</dd>
            <dt className="font-semibold">Due now</dt>
            <dd className={`text-right font-bold ${money.dueNow > 0 ? 'text-ppc-gold' : ''}`}>{usd(money.dueNow)}</dd>
            <dt className="text-muted">{money.balance < 0 ? 'Paid ahead' : 'Still to pay in total'}</dt>
            <dd className="text-right font-semibold">{usd(Math.abs(money.balance))}</dd>
          </dl>
          <p className="mt-2 text-xs text-muted">
            {money.fullDue ? 'This job is finished, so the full amount is due.' : 'Half is due now. The rest is due when the job is Completed.'}
          </p>
          <button type="button" onClick={() => { setEditing(true); setSaved(null); }} className="mt-2 rounded border border-line px-2 py-1 text-xs font-semibold text-muted hover:border-ppc-gold/60 hover:text-ppc-gold">
            Change the cost
          </button>
        </>
      )}

      {error && <p className="mt-2 text-sm font-semibold text-red-300">{error}</p>}
      {saved && <p className="mt-2 text-sm font-semibold text-emerald-300">{saved}</p>}

      {money.payments.length > 0 && (
        <ul className="mt-3 divide-y divide-line/50 border-t border-line text-sm">
          {money.payments.map((p, i) => (
            <li key={`${p.paymentId}-${i}`} className="flex items-baseline justify-between gap-2 py-1.5">
              <span>
                Powerplay sent <span className="font-semibold tabular-nums">{usd(p.cents)}</span>
                {p.note && <span className="block text-xs text-muted">{p.note}</span>}
              </span>
              <span className="shrink-0 text-[0.7rem] text-muted"><LocalTime iso={p.at} /></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
