'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { STATUS_META, STATUS_OPTIONS } from '@/lib/constants';
import { formatLong } from '@/lib/dates';
import { formatCad, listPrice } from '@/lib/pricing';
import { upsTrackingUrl } from '@/lib/data/update-mail';
import { saveOrder } from '@/app/orders/actions';
import type { Order, OrderStatus } from '@/lib/types';

/**
 * Quick edit, off a double-click on a board card.
 *
 * The five things that change between glances at the board — status, value,
 * name, invoice number, and "where are the dates at" — without leaving it.
 * Everything else is the full editor, one click away at the bottom.
 *
 * Saves go through the same `saveOrder` action as the editor, so the
 * EDITABLE allowlist and the history log apply exactly as they would there.
 *
 * Emails are NOT sent from here. After a status change the dialog offers a
 * button to the order page's email panel, where the preview, the amount and
 * the recipient are. Sending a payment request with no amount from a popup
 * is the kind of shortcut that costs a customer relationship.
 */

export type QuickEditOrder = Pick<
  Order,
  | 'id' | 'teamName' | 'invoiceNumber' | 'status' | 'orderValue' | 'trackingCode'
  | 'approvedDate' | 'datePaid' | 'productionStartDate' | 'productionFinishDate'
  | 'estimatedFinishDate' | 'completedAt' | 'createdAt'
  | 'jerseyTier' | 'jerseyType' | 'sockType' | 'pantShellType' | 'sets' | 'orderMode'
  | 'stitchedSublimatedLogos' | 'shoulderCut' | 'hasCaptainPatches' | 'captainCQuantity' | 'captainAQuantity'
>;

export function OrderQuickEdit({ order, onClose }: { order: QuickEditOrder; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [teamName, setTeamName] = useState(order.teamName);
  const [invoiceNumber, setInvoiceNumber] = useState(order.invoiceNumber);
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [value, setValue] = useState(order.orderValue === null ? '' : String(order.orderValue));
  const [error, setError] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState<OrderStatus | null>(null);
  const lp = listPrice(order);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dirty =
    teamName !== order.teamName ||
    invoiceNumber !== order.invoiceNumber ||
    status !== order.status ||
    value !== (order.orderValue === null ? '' : String(order.orderValue));

  function save() {
    setError(null);
    const patch: Partial<Order> = {};
    if (teamName !== order.teamName) patch.teamName = teamName;
    if (invoiceNumber !== order.invoiceNumber) patch.invoiceNumber = invoiceNumber;
    if (status !== order.status) patch.status = status;
    const v = value.trim() === '' ? null : Number(value);
    if (v !== null && (!Number.isFinite(v) || v < 0)) {
      setError('Order value has to be a number of dollars.');
      return;
    }
    if (v !== order.orderValue) patch.orderValue = v;

    start(async () => {
      const r = await saveOrder(order.id, patch);
      if (!r.ok) {
        setError(r.error ?? Object.values(r.errors ?? {})[0] ?? 'Could not save.');
        return;
      }
      if (patch.status) setSavedStatus(patch.status);
      router.refresh();
      if (!patch.status) onClose();
    });
  }

  const dates: Array<[string, string | null]> = [
    ['Created', order.createdAt.slice(0, 10)],
    ['Signed off', order.approvedDate],
    ['Paid', order.datePaid],
    ['Production start', order.productionStartDate],
    ['Production finished', order.productionFinishDate],
    ['Estimated finish', order.estimatedFinishDate],
    ['Completed', order.completedAt],
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Quick edit ${order.teamName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-xl border border-line bg-surface p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              aria-label="Team name"
              className="w-full !text-lg !font-bold"
            />
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded px-2 py-1 text-muted hover:text-red-300">
            ✕
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} className="w-full">
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].emoji} {STATUS_META[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">
              Order value (CAD){value === '' ? ' — list price' : ' — set by hand'}
            </span>
            <input
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder={lp ? formatCad(lp.total) : 'No tier to price'}
              className="w-full"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Invoice number</span>
            <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="w-full" />
          </label>
        </div>

        {order.trackingCode && (
          <p className="mt-4 text-sm">
            <span className="text-muted">UPS tracking: </span>
            <a href={upsTrackingUrl(order.trackingCode)} target="_blank" rel="noreferrer" className="font-semibold text-ppc-gold hover:underline">
              {order.trackingCode} →
            </a>
          </p>
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

        {savedStatus && (
          <div className="mt-4 rounded-lg border border-ppc-gold/50 bg-ppc-gold/10 p-3 text-sm">
            <p className="font-semibold text-ppc-gold">
              Now {STATUS_META[savedStatus].label}. Does the team need to hear about it?
            </p>
            <p className="mt-1 text-muted">
              Emails go from the order page, where you can see the preview and set any amount before it sends.
            </p>
            <Link
              href={`/orders/${order.id}#customer-emails`}
              className="mt-2 inline-block rounded-lg bg-ppc-gold px-3 py-1.5 text-sm font-semibold text-black hover:bg-ppc-gold-dim"
            >
              Send the email →
            </Link>
          </div>
        )}

        {error && <p className="mt-3 text-sm font-semibold text-red-300">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-2">
          <div className="flex gap-3 text-sm">
            <Link href={`/orders/${order.id}`} className="font-semibold text-ppc-gold hover:underline">
              Full order
            </Link>
            <Link href={`/orders/${order.id}/edit`} className="font-semibold text-ppc-gold hover:underline">
              Edit everything
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {value !== '' && lp && (
              <button type="button" onClick={() => setValue('')} className="text-xs font-semibold text-ppc-gold hover:underline">
                Use list price {formatCad(lp.total)}
              </button>
            )}
            <button
              type="button"
              disabled={!dirty || pending}
              onClick={save}
              className="rounded-lg bg-ppc-gold px-4 py-2 text-sm font-semibold text-black hover:bg-ppc-gold-dim disabled:opacity-40"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
