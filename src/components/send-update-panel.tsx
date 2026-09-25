'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { composeUpdateMail, type UpdateMailInput } from '@/lib/data/update-mail';
import { MONEY_STAGES, type DueUpdate } from '@/lib/data/customer-updates-logic';
import { UPDATE_STAGE_LABEL, type CustomerEmailRecord, type UpdateStage } from '@/lib/types';
import { formatTimestamp } from '@/lib/dates';
import { sendUpdateAction } from '@/app/orders/[id]/update-actions';

/**
 * "Email the customer this update?" One card per due email: recipient,
 * subject, a preview, the amount box for the three request emails, Send and
 * Not now. Below it, what has already gone, each with Resend.
 *
 * "Not now" is remembered per order in localStorage (`ppc-updates-hidden-<id>`)
 * so dismissing a card sticks across a refresh. The server always renders the
 * cards visible first — localStorage is only readable after mount — so a
 * dismissed card can flash on first paint before the effect below hides it
 * again.
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
  const storageKey = `ppc-updates-hidden-${orderId}`;
  const [hidden, setHidden] = useState<Set<UpdateStage>>(new Set());
  const loadedHidden = useRef(false);
  const [open, setOpen] = useState<UpdateStage | null>(null);
  const [amount, setAmount] = useState<Partial<Record<UpdateStage, string>>>({});
  const [howToPay, setHowToPay] = useState(preview.howToPay);
  const [msg, setMsg] = useState<{ stage: string; text: string; ok: boolean } | null>(null);
  /** Which stage's Send/Resend is in flight — only that card disables and says "Sending…". */
  const [inFlight, setInFlight] = useState<UpdateStage | null>(null);
  const [, start] = useTransition();

  // Read the dismissed set once on mount. Anything no longer due (already
  // sent, or the order has moved on) is dropped rather than carried forward.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const stored = JSON.parse(raw) as string[];
        const dueStages = new Set(due.map((d) => d.stage));
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the dismissed set from localStorage after hydration is the hydration-safe pattern (see use-caller-name.ts)
        setHidden(new Set(stored.filter((s): s is UpdateStage => dueStages.has(s as UpdateStage))));
      }
    } catch {
      // localStorage unavailable (private browsing, etc.) — keep cards visible.
    } finally {
      loadedHidden.current = true;
    }
    // Only ever read once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A stage that falls out of `due` (sent, or the order moved past it) is
  // dropped from the hidden set so it can't outlive the card it belonged to.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pruning the stored set to match a prop that changes after a send/revalidate, not derivable during render
    setHidden((h) => {
      const dueStages = new Set(due.map((d) => d.stage));
      const next = new Set([...h].filter((s) => dueStages.has(s)));
      return next.size === h.size ? h : next;
    });
  }, [due]);

  // Persist whenever the set changes, after the initial load has happened.
  useEffect(() => {
    if (!loadedHidden.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify([...hidden]));
    } catch {
      // ignore — nothing to persist to
    }
  }, [hidden, storageKey]);

  function send(stage: UpdateStage, force = false) {
    setMsg(null);
    setInFlight(stage);
    start(async () => {
      try {
        const r = await sendUpdateAction(orderId, stage, { amount: amount[stage] ?? '', howToPay, force });
        setMsg({ stage, text: r.ok ? 'Sent.' : r.error ?? 'Could not send', ok: r.ok });
      } finally {
        setInFlight(null);
      }
    });
  }

  const visible = due.filter((d) => !hidden.has(d.stage));
  const chips = due.filter((d) => hidden.has(d.stage));

  return (
    <div className="space-y-3">
      {visible.map((d) => {
        const m = composeUpdateMail(d.stage, { ...preview, amount: amount[d.stage] ?? '', howToPay });
        const sending = inFlight === d.stage;
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
                  <label htmlFor={`amount-${d.stage}`} className="text-xs font-medium text-muted">Amount, exactly as it should read</label>
                  <input id={`amount-${d.stage}`} className="mt-1 w-full" placeholder="$250" value={amount[d.stage] ?? ''} onChange={(e) => setAmount((a) => ({ ...a, [d.stage]: e.target.value }))} />
                  <p className="mt-1 text-xs text-muted">Goes into this email only. Not saved anywhere.</p>
                </div>
                <div>
                  <label htmlFor={`howtopay-${d.stage}`} className="text-xs font-medium text-muted">How to pay</label>
                  <textarea id={`howtopay-${d.stage}`} className="mt-1 w-full" rows={3} value={howToPay} onChange={(e) => setHowToPay(e.target.value)} />
                </div>
              </div>
            )}
            <button type="button" className="mt-3 text-xs font-semibold text-ppc-gold hover:underline" onClick={() => setOpen(open === d.stage ? null : d.stage)}>
              {open === d.stage ? 'Hide preview' : 'Preview'}
            </button>
            {open === d.stage && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-xs">{m.text}</pre>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={!canSend || sending} className="rounded-lg bg-ppc-gold px-3.5 py-2 text-sm font-semibold text-black disabled:opacity-50" onClick={() => send(d.stage)}>
                {sending ? 'Sending…' : 'Send'}
              </button>
              <button type="button" className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-muted" onClick={() => setHidden((h) => new Set(h).add(d.stage))}>
                Not now
              </button>
              <span aria-live="polite">
                {msg?.stage === d.stage && <span className={`text-xs font-semibold ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</span>}
              </span>
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
            {[...sent].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).map((r, n) => {
              const isMoney = MONEY_STAGES.has(r.stage);
              const sending = inFlight === r.stage;
              const resendDisabled = sending || (isMoney && (amount[r.stage] ?? '').trim().length === 0);
              return (
                <li key={`${r.stage}-${r.sentAt}-${n}`} className="flex flex-wrap items-center gap-x-3">
                  <span className="font-semibold">{UPDATE_STAGE_LABEL[r.stage]}</span>
                  <span className="text-muted">{formatTimestamp(r.sentAt)} · {r.to}</span>
                  {isMoney && (
                    <span className="flex items-center gap-1">
                      <label htmlFor={`resend-amount-${r.stage}-${n}`} className="text-xs font-medium text-muted">Amount</label>
                      <input id={`resend-amount-${r.stage}-${n}`} className="w-20 text-xs" placeholder="$250" value={amount[r.stage] ?? ''} onChange={(e) => setAmount((a) => ({ ...a, [r.stage]: e.target.value }))} />
                    </span>
                  )}
                  <button type="button" disabled={resendDisabled} className="text-xs font-semibold text-ppc-gold hover:underline disabled:opacity-50" onClick={() => send(r.stage, true)}>
                    {sending ? 'Sending…' : 'Resend'}
                  </button>
                  <span aria-live="polite">
                    {msg?.stage === r.stage && <span className={`text-xs ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {visible.length === 0 && chips.length === 0 && sent.length === 0 && (
        <p className="text-sm text-muted">Nothing to send at this stage.</p>
      )}
    </div>
  );
}
