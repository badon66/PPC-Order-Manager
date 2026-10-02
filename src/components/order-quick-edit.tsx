'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { STATUS_META, STATUS_OPTIONS } from '@/lib/constants';
import { formatLong, today } from '@/lib/dates';
import { formatCad, listPrice } from '@/lib/pricing';
import { paymentsOn } from '@/lib/payments';
import { dueUpdates } from '@/lib/data/customer-updates-logic';
import { upsTrackingUrl } from '@/lib/data/update-mail';
import { saveOrder } from '@/app/orders/actions';
import { markUpdateSentAction } from '@/app/orders/mark-sent-action';
import {
  PAYMENT_KINDS, PAYMENT_KIND_LABEL, UPDATE_STAGE_LABEL,
  type Order, type OrderStatus, type PaymentKind, type UpdateStage,
} from '@/lib/types';

/**
 * Quick edit, off a double-click on a board card.
 *
 * The things that change between glances at the board — status, value, name,
 * invoice, what's been paid, whether it's gone to the factory — without
 * leaving it. Everything else is the full editor, one click away.
 *
 * Saves go through the same `saveOrder` as the editor, so the EDITABLE
 * allowlist and the history log apply exactly as they would there.
 *
 * Emails: whenever the order OWES the team an update (`dueUpdates`, the same
 * rule the order page uses), the popup lists each one with three choices.
 * "Send" goes to the order page's email panel, where the preview and any
 * amount live. "Already sent" records it so it's never asked again. "Remind
 * me later" leaves it due, so it's back the next time this opens.
 */

export type QuickEditOrder = Pick<
  Order,
  | 'id' | 'teamName' | 'invoiceNumber' | 'status' | 'orderValue' | 'trackingCode'
  | 'approvedDate' | 'approvalRecord' | 'datePaid' | 'productionStartDate' | 'productionFinishDate'
  | 'estimatedFinishDate' | 'completedAt' | 'createdAt' | 'sentToFactoryAt'
  | 'jerseyTier' | 'jerseyType' | 'sockType' | 'pantShellType' | 'sets' | 'orderMode'
  | 'stitchedSublimatedLogos' | 'shoulderCut' | 'hasCaptainPatches' | 'captainCQuantity' | 'captainAQuantity'
  | 'multiPanelSocks' | 'customerEmails' | 'paymentsReceived' | 'contactEmail'
>;

export function OrderQuickEdit({ order, onClose }: { order: QuickEditOrder; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [teamName, setTeamName] = useState(order.teamName);
  const [invoiceNumber, setInvoiceNumber] = useState(order.invoiceNumber);
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [value, setValue] = useState(order.orderValue === null ? '' : String(order.orderValue));
  const [paid, setPaid] = useState<PaymentKind[]>(order.paymentsReceived ?? []);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<UpdateStage>>(() => new Set());

  const lp = listPrice(order);
  const inferred = paymentsOn(order);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /*
   * What the team is owed, for the order as it would be after Save: the
   * status in the dropdown, not the one on disk. Changing the dropdown to
   * Shipped shows the "it's shipped" email before you've even saved, which is
   * the moment you want to decide about it.
   */
  const due = useMemo(
    () =>
      dueUpdates(
        { ...order, status, customerEmails: order.customerEmails, trackingCode: order.trackingCode, approvedDate: order.approvedDate, approvalRecord: order.approvalRecord, contactEmail: order.contactEmail },
        [],
      ).filter((d) => d.stage !== 'payment_received' && !hidden.has(d.stage)),
    [order, status, hidden],
  );

  const samePaid = paid.length === (order.paymentsReceived ?? []).length && paid.every((k) => (order.paymentsReceived ?? []).includes(k));
  const dirty =
    teamName !== order.teamName ||
    invoiceNumber !== order.invoiceNumber ||
    status !== order.status ||
    value !== (order.orderValue === null ? '' : String(order.orderValue)) ||
    !samePaid;

  function buildPatch(): Partial<Order> | null {
    const patch: Partial<Order> = {};
    if (teamName !== order.teamName) patch.teamName = teamName;
    if (invoiceNumber !== order.invoiceNumber) patch.invoiceNumber = invoiceNumber;
    if (status !== order.status) patch.status = status;
    if (!samePaid) patch.paymentsReceived = paid;
    const v = value.trim() === '' ? null : Number(value);
    if (v !== null && (!Number.isFinite(v) || v < 0)) {
      setError('Order value has to be a number of dollars.');
      return null;
    }
    if (v !== order.orderValue) patch.orderValue = v;
    return patch;
  }

  function save(extra: Partial<Order> = {}, close = true) {
    setError(null);
    const base = buildPatch();
    if (!base) return;
    const patch = { ...base, ...extra };
    if (Object.keys(patch).length === 0) {
      if (close) onClose();
      return;
    }
    start(async () => {
      const r = await saveOrder(order.id, patch);
      if (!r.ok) {
        setError(r.error ?? Object.values(r.errors ?? {})[0] ?? 'Could not save.');
        return;
      }
      router.refresh();
      if (close) onClose();
    });
  }

  /** "Sent off to factory": stamp today and, if it isn't there yet, move it to In Production. */
  function sentToFactory() {
    const extra: Partial<Order> = { sentToFactoryAt: today() };
    if (STATUS_META[status].order < STATUS_META.in_production.order) {
      extra.status = 'in_production';
      setStatus('in_production');
    }
    save(extra, false);
  }

  /**
   * "Send": save anything changed here FIRST, then go to the email panel.
   * Navigating with an unsaved status change would show the panel the old
   * status and offer the wrong email.
   */
  function goSend() {
    setError(null);
    const base = buildPatch();
    if (!base) return;
    const target = `/orders/${order.id}#customer-emails`;
    if (Object.keys(base).length === 0) {
      router.push(target);
      return;
    }
    start(async () => {
      const r = await saveOrder(order.id, base);
      if (!r.ok) {
        setError(r.error ?? Object.values(r.errors ?? {})[0] ?? 'Could not save.');
        return;
      }
      router.push(target);
    });
  }

  function alreadySent(stage: UpdateStage) {
    start(async () => {
      const r = await markUpdateSentAction(order.id, stage);
      if (!r.ok) setError(r.error ?? 'Could not record that.');
      else {
        setHidden((h) => new Set(h).add(stage));
        router.refresh();
      }
    });
  }

  function togglePaid(k: PaymentKind) {
    setPaid((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  }

  const dates: Array<[string, string | null]> = [
    ['Created', order.createdAt.slice(0, 10)],
    ['Signed off', order.approvedDate],
    ['Sent to factory', order.sentToFactoryAt],
    ['Production start', order.productionStartDate],
    ['Production finished', order.productionFinishDate],
    ['Estimated finish', order.estimatedFinishDate],
    ['Paid in full', order.datePaid],
    ['Shipped / completed', order.completedAt],
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Quick edit ${order.teamName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} aria-label="Team name" className="min-w-0 flex-1 !text-lg !font-bold" />
          <button type="button" onClick={onClose} aria-label="Close" className="rounded px-2 py-1 text-muted hover:text-red-300">✕</button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} className="w-full">
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].emoji} {STATUS_META[s].label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">
              Order value (CAD){value === '' ? ' — list price' : ' — set by hand'}
            </span>
            <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))} placeholder={lp ? formatCad(lp.total) : 'No tier to price'} className="w-full" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Invoice number</span>
            <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="w-full" />
          </label>
        </div>

        {/* Payments and the factory, side by side. */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-surface-2 p-3">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Payments received</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {PAYMENT_KINDS.map((k) => {
                const on = paid.includes(k);
                // Implied by where the order sits or an email that went out, but not ticked here.
                const implied = !on && inferred[k === 'initial_deposit' ? 'initialDeposit' : k === 'production_deposit' ? 'productionDeposit' : 'finalPayment'];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => togglePaid(k)}
                    title={implied ? 'Looks paid from where the order is — tick to make it official.' : undefined}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold capitalize ${
                      on
                        ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
                        : implied
                          ? 'border-emerald-400/40 bg-emerald-500/5 text-emerald-200/70'
                          : 'border-line bg-surface text-muted hover:border-ppc-gold/60'
                    }`}
                  >
                    {on ? '✓ ' : implied ? '~ ' : ''}{PAYMENT_KIND_LABEL[k]}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">Tick what&apos;s actually in. A faint tick means it looks paid from the order&apos;s stage but hasn&apos;t been marked.</p>
          </div>

          <div className="rounded-lg border border-line bg-surface-2 p-3">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Factory</div>
            {order.sentToFactoryAt ? (
              <p className="mt-2 text-sm">
                <span className="font-semibold text-ppc-gold">Sent off {formatLong(order.sentToFactoryAt)}</span>
              </p>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={sentToFactory}
                className="mt-2 rounded-lg border border-ppc-gold bg-ppc-gold/10 px-3 py-1.5 text-sm font-semibold text-ppc-gold hover:bg-ppc-gold/20 disabled:opacity-40"
              >
                🏭 Sent off to factory
              </button>
            )}
            <p className="mt-2 text-xs text-muted">
              Stamps today{STATUS_META[status].order < STATUS_META.in_production.order ? ' and moves the order to In Production' : ''}.
            </p>
            {order.trackingCode && (
              <p className="mt-2 text-sm">
                <span className="text-muted">UPS: </span>
                <a href={upsTrackingUrl(order.trackingCode)} target="_blank" rel="noreferrer" className="font-semibold text-ppc-gold hover:underline">{order.trackingCode} →</a>
              </p>
            )}
          </div>
        </div>

        {due.length > 0 && (
          <div className="mt-4 rounded-lg border border-ppc-gold/50 bg-ppc-gold/10 p-3">
            <p className="text-sm font-semibold text-ppc-gold">
              {status !== order.status ? `Once this is ${STATUS_META[status].label}, the team should hear:` : 'The team hasn’t been told yet:'}
            </p>
            <ul className="mt-2 space-y-2">
              {due.map((d) => (
                <li key={d.stage} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface/60 px-3 py-2 text-sm">
                  <span className="font-semibold">{UPDATE_STAGE_LABEL[d.stage]}{d.blocked ? <span className="ml-2 text-xs font-normal text-amber-200">{d.blocked}</span> : null}</span>
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={goSend}
                      className="rounded-lg bg-ppc-gold px-2.5 py-1 text-xs font-semibold text-black hover:bg-ppc-gold-dim disabled:opacity-40"
                    >
                      Send →
                    </button>
                    <button type="button" disabled={pending} onClick={() => alreadySent(d.stage)} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold hover:border-ppc-gold/60">
                      Already sent
                    </button>
                    <button type="button" onClick={() => setHidden((h) => new Set(h).add(d.stage))} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-muted hover:text-foreground">
                      Remind me later
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Send goes to the order page, where the preview and any amount are. Remind me later keeps it on this list for next time.</p>
          </div>
        )}

        <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Dates</div>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {dates.map(([label, d]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line/50 py-1">
                <dt className="text-muted">{label}</dt>
                <dd className={d ? 'font-semibold' : 'text-muted'}>{d ? formatLong(d) : '—'}</dd>
              </div>
            ))}
          </dl>
        </div>

        {error && <p className="mt-3 text-sm font-semibold text-red-300">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-2">
          <div className="flex gap-3 text-sm">
            <Link href={`/orders/${order.id}`} className="font-semibold text-ppc-gold hover:underline">Full order</Link>
            <Link href={`/orders/${order.id}/edit`} className="font-semibold text-ppc-gold hover:underline">Edit everything</Link>
          </div>
          <div className="flex items-center gap-2">
            {value !== '' && lp && (
              <button type="button" onClick={() => setValue('')} className="text-xs font-semibold text-ppc-gold hover:underline">
                Use list price {formatCad(lp.total)}
              </button>
            )}
            <button type="button" disabled={!dirty || pending} onClick={() => save()} className="rounded-lg bg-ppc-gold px-4 py-2 text-sm font-semibold text-black hover:bg-ppc-gold-dim disabled:opacity-40">
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
