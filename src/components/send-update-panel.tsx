'use client';

import { useState, useTransition } from 'react';
import { composeUpdateMail, type UpdateMailInput } from '@/lib/data/update-mail';
import type { DueUpdate } from '@/lib/data/customer-updates-logic';
import { UPDATE_STAGE_LABEL, type CustomerEmailRecord, type UpdateStage } from '@/lib/types';
import { formatTimestamp } from '@/lib/dates';
import { sendUpdateAction } from '@/app/orders/[id]/update-actions';

/**
 * "Email the customer this update?" One card per due email: recipient,
 * subject, a preview, the amount box for the three request emails, Send and
 * Not now. Below it, what has already gone, each with Resend.
 */
export function SendUpdatePanel({
  orderId,
  to,
  due,
  sent,
  preview,
}: {
  orderId: string;
  to: string;
  due: DueUpdate[];
  sent: CustomerEmailRecord[];
  /** Everything the composer needs except the amount, which is typed here. */
  preview: UpdateMailInput;
}) {
  const [hidden, setHidden] = useState<Set<UpdateStage>>(new Set());
  const [open, setOpen] = useState<UpdateStage | null>(null);
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [howToPay, setHowToPay] = useState(preview.howToPay);
  const [msg, setMsg] = useState<{ stage: string; text: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();

  function send(stage: UpdateStage, force = false) {
    setMsg(null);
    start(async () => {
      const r = await sendUpdateAction(orderId, stage, { amount: amount[stage] ?? '', howToPay, force });
      setMsg({ stage, text: r.ok ? 'Sent.' : r.error ?? 'Could not send', ok: r.ok });
    });
  }

  const visible = due.filter((d) => !hidden.has(d.stage));
  const chips = due.filter((d) => hidden.has(d.stage));

  return (
    <div className="space-y-3">
      {visible.map((d) => {
        const m = composeUpdateMail(d.stage, { ...preview, amount: amount[d.stage] ?? '', howToPay });
        const canSend = !d.blocked && (!d.needsAmount || (amount[d.stage] ?? '').trim().length > 0);
        return (
          <div key={d.stage} className="rounded-xl border border-ppc-gold/50 bg-ppc-gold/5 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-ppc-gold">Email the customer?</p>
            <p className="mt-1 text-base font-bold">{UPDATE_STAGE_LABEL[d.stage]}</p>
            <p className="text-sm text-muted">To {to || 'nobody yet'} · Subject: {m.subject}</p>
            {d.blocked && <p className="mt-2 text-sm text-amber-300">{d.blocked}</p>}
            {d.needsAmount && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted">Amount, exactly as it should read</label>
                  <input className="mt-1 w-full" placeholder="$250" value={amount[d.stage] ?? ''} onChange={(e) => setAmount((a) => ({ ...a, [d.stage]: e.target.value }))} />
                  <p className="mt-1 text-xs text-muted">Goes into this email only. Not saved anywhere.</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted">How to pay</label>
                  <textarea className="mt-1 w-full" rows={3} value={howToPay} onChange={(e) => setHowToPay(e.target.value)} />
                </div>
              </div>
            )}
            <button type="button" className="mt-3 text-xs font-semibold text-ppc-gold hover:underline" onClick={() => setOpen(open === d.stage ? null : d.stage)}>
              {open === d.stage ? 'Hide preview' : 'Preview'}
            </button>
            {open === d.stage && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-xs">{m.text}</pre>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={!canSend || pending} className="rounded-lg bg-ppc-gold px-3.5 py-2 text-sm font-semibold text-black disabled:opacity-50" onClick={() => send(d.stage)}>
                {pending ? 'Sending…' : 'Send'}
              </button>
              <button type="button" className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-muted" onClick={() => setHidden((h) => new Set(h).add(d.stage))}>
                Not now
              </button>
              {msg?.stage === d.stage && <span className={`text-xs font-semibold ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</span>}
            </div>
          </div>
        );
      })}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((d) => (
            <button key={d.stage} type="button" className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:border-ppc-gold/60 hover:text-ppc-gold" onClick={() => setHidden((h) => { const n = new Set(h); n.delete(d.stage); return n; })}>
              {UPDATE_STAGE_LABEL[d.stage]} email not sent · Send
            </button>
          ))}
        </div>
      )}

      {sent.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted">Sent to the customer</p>
          <ul className="mt-1 space-y-1 text-sm">
            {[...sent].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).map((r, n) => (
              <li key={`${r.stage}-${r.sentAt}-${n}`} className="flex flex-wrap items-center gap-x-3">
                <span className="font-semibold">{UPDATE_STAGE_LABEL[r.stage]}</span>
                <span className="text-muted">{formatTimestamp(r.sentAt)} · {r.to}</span>
                <button type="button" disabled={pending} className="text-xs font-semibold text-ppc-gold hover:underline" onClick={() => send(r.stage, true)}>Resend</button>
                {msg?.stage === r.stage && <span className={`text-xs ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {visible.length === 0 && chips.length === 0 && sent.length === 0 && (
        <p className="text-sm text-muted">Nothing to send at this stage.</p>
      )}
    </div>
  );
}
