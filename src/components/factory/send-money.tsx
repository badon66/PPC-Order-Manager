'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordFactoryPayment, voidFactoryPayment } from '@/app/orders/factory-admin-actions';

const freshId = () => `pay_${globalThis.crypto.randomUUID().replace(/-/g, '')}`;

/**
 * "I sent money" (Keenan). An amount in US dollars, the job it's for (or the
 * whole balance, oldest job first), an optional note the factory sees.
 * Each form carries one payment id, renewed only after a payment is saved, so
 * pressing twice records it once.
 */
export function SendMoneyForm({ jobs, fixedJob }: { jobs: Array<{ id: string; label: string }>; fixedJob?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [paymentId, setPaymentId] = useState(freshId);
  const [amount, setAmount] = useState('');
  const [job, setJob] = useState(fixedJob ?? '');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function send() {
    setMsg(null);
    start(async () => {
      const r = await recordFactoryPayment(paymentId, amount, job, note);
      if (!r.ok) {
        setMsg({ text: r.error, ok: false });
        return;
      }
      setMsg({ text: `${r.summary} The factory can see it now.`, ok: true });
      setAmount('');
      setNote('');
      setPaymentId(freshId());
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs font-medium text-muted" htmlFor={`pay-amount-${fixedJob ?? 'all'}`}>Amount sent (USD)</label>
          <input id={`pay-amount-${fixedJob ?? 'all'}`} type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="mt-1 block w-32" />
        </div>
        {!fixedJob && (
          <div className="min-w-0">
            <label className="text-xs font-medium text-muted" htmlFor="pay-job">For</label>
            <select id="pay-job" value={job} onChange={(e) => setJob(e.target.value)} className="mt-1 block max-w-[18rem]">
              <option value="">The whole balance</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.label}</option>
              ))}
            </select>
          </div>
        )}
        <div className="min-w-[10rem] flex-1">
          <label className="text-xs font-medium text-muted" htmlFor={`pay-note-${fixedJob ?? 'all'}`}>Note the factory sees (optional)</label>
          <input id={`pay-note-${fixedJob ?? 'all'}`} type="text" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. wire sent Nov 26" className="mt-1 block w-full" />
        </div>
        <button type="button" disabled={pending || !amount.trim()} onClick={send} className="rounded-lg bg-ppc-gold px-4 py-2 text-sm font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50">
          {pending ? 'Saving…' : 'I sent money'}
        </button>
      </div>
      {msg && <p className={`text-sm font-semibold ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</p>}
    </div>
  );
}

/** Undo a payment entered by mistake. Two presses; the factory is told it was removed. */
export function UndoPayment({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onBlur={() => setSure(false)}
        onClick={() => {
          if (!sure) return setSure(true);
          start(async () => {
            const r = await voidFactoryPayment(paymentId);
            if (!r.ok) setError(r.error);
            else router.refresh();
          });
        }}
        className={`rounded border px-2 py-0.5 text-xs font-semibold disabled:opacity-50 ${sure ? 'border-red-500/70 text-red-300' : 'border-line text-muted hover:border-red-500/60 hover:text-red-300'}`}
      >
        {pending ? 'Removing…' : sure ? 'Press again to remove' : 'Undo'}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </span>
  );
}
