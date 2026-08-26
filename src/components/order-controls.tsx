'use client';

import { useState, useTransition } from 'react';
import { JERSEY_TYPE_LABELS, LEAD_TIME_DAYS, STATUS_META, STATUS_OPTIONS } from '@/lib/constants';
import { formatShort, isCalendarDate } from '@/lib/dates';
import { estimateFinish } from '@/lib/order-utils';
import { updateOperationalFields } from '@/app/orders/actions';
import type { JerseyType, OrderStatus } from '@/lib/types';

export function OperationalControls({
  orderId,
  status,
  estimatedFinishDate,
  productionStartDate,
  productionFinishDate,
  jerseyType,
  trackingCode,
}: {
  orderId: string;
  status: OrderStatus;
  estimatedFinishDate: string | null;
  productionStartDate: string | null;
  productionFinishDate: string | null;
  jerseyType: JerseyType | null;
  trackingCode: string;
}) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState({
    status,
    estimatedFinishDate: estimatedFinishDate ?? '',
    productionStartDate: productionStartDate ?? '',
    productionFinishDate: productionFinishDate ?? '',
    trackingCode,
  });

  /*
   * Tracking exists once there's something to track.
   *
   * Before production there's no parcel, so the field is an empty box inviting
   * a question nobody can answer yet. It appears at In Production and stays
   * from then on.
   */
  const showTracking = STATUS_META[local.status].order >= STATUS_META.in_production.order;

  const range = estimateFinish(
    isCalendarDate(local.productionStartDate) ? local.productionStartDate : null,
    jerseyType,
  );
  const lead = jerseyType ? LEAD_TIME_DAYS[jerseyType] : null;

  /*
   * Auto-fill, never overwrite.
   *
   * Setting a production start date fills the estimate with the late end of
   * the range for this build type — under-promise, since a customer told the
   * early date and handed the late one is the version that generates a phone
   * call. It only writes into an empty field: a date typed by hand is a
   * decision, and quietly replacing it because a start date moved would be the
   * app overruling the person using it.
   */
  function onStartDateChange(value: string) {
    setLocal((s) => ({ ...s, productionStartDate: value }));
    const patch: Record<string, string> = { productionStartDate: value };

    const next = estimateFinish(isCalendarDate(value) ? value : null, jerseyType);
    if (next && local.estimatedFinishDate === '') {
      patch.estimatedFinishDate = next.max;
      setLocal((s) => ({ ...s, productionStartDate: value, estimatedFinishDate: next.max }));
    }
    save(patch, next && !local.estimatedFinishDate ? 'Start date saved, finish estimated' : 'Start date saved');
  }

  function save(patch: Partial<typeof local>, label: string) {
    setError(null);
    start(async () => {
      const res = await updateOperationalFields(orderId, patch);
      if (res.ok) {
        setSaved(label);
        setTimeout(() => setSaved(null), 2000);
      } else {
        setError(res.error ?? 'Could not save');
      }
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div>
        <label className="text-xs font-medium text-muted">Order Status</label>
        <select
          className="mt-1"
          value={local.status}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value as OrderStatus;
            setLocal((s) => ({ ...s, status: v }));
            save({ status: v }, 'Status saved');
          }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].emoji} {STATUS_META[s].label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-muted">Production Start Date</label>
        <input
          type="date"
          className="mt-1"
          value={local.productionStartDate}
          disabled={pending}
          onChange={(e) => onStartDateChange(e.target.value)}
        />
        {lead && (
          <p className="mt-1 text-xs text-muted">
            {JERSEY_TYPE_LABELS[jerseyType!]} takes {lead.min}–{lead.max} days.
          </p>
        )}
        {!jerseyType && (
          <p className="mt-1 text-xs text-muted">
            Pick a jersey type to estimate the finish date automatically.
          </p>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-muted">Estimated Finish Date</label>
        <input
          type="date"
          className="mt-1"
          value={local.estimatedFinishDate}
          disabled={pending}
          onChange={(e) => setLocal((s) => ({ ...s, estimatedFinishDate: e.target.value }))}
          onBlur={(e) => save({ estimatedFinishDate: e.target.value }, 'Finish date saved')}
        />
        {range && (
          <p className="mt-1 text-xs text-muted">
            Expect {formatShort(range.min)} – {formatShort(range.max)}
            {local.estimatedFinishDate !== range.max && (
              <button
                type="button"
                className="ml-2 font-semibold text-ppc-gold hover:underline"
                onClick={() => {
                  setLocal((s) => ({ ...s, estimatedFinishDate: range.max }));
                  save({ estimatedFinishDate: range.max }, 'Finish date estimated');
                }}
              >
                use {formatShort(range.max)}
              </button>
            )}
          </p>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-muted">Production Finish Date</label>
        <input
          type="date"
          className="mt-1"
          value={local.productionFinishDate}
          disabled={pending}
          onChange={(e) => setLocal((s) => ({ ...s, productionFinishDate: e.target.value }))}
          onBlur={(e) => save({ productionFinishDate: e.target.value }, 'Finish date saved')}
        />
        <p className="mt-1 text-xs text-muted">When it actually finished.</p>
      </div>

      {showTracking && (
        <div>
          <label className="text-xs font-medium text-muted">Tracking Code</label>
          <input
            className="mt-1"
            placeholder="Enter tracking code"
            value={local.trackingCode}
            disabled={pending}
            onChange={(e) => setLocal((s) => ({ ...s, trackingCode: e.target.value }))}
            onBlur={(e) => save({ trackingCode: e.target.value }, 'Tracking saved')}
          />
        </div>
      )}

      {(saved || error || pending) && (
        <p
          className={`sm:col-span-2 xl:col-span-3 text-xs font-semibold ${
            error ? 'text-red-300' : 'text-emerald-300'
          }`}
        >
          {error ?? (pending ? 'Saving…' : saved)}
        </p>
      )}
    </div>
  );
}

export function CopyButton({
  value,
  label,
  className = '',
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 px-3.5 py-2 text-sm font-semibold hover:border-ppc-gold/60 hover:text-ppc-gold ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard blocked — ignore */
        }
      }}
    >
      {done ? '✓ Copied' : label}
    </button>
  );
}
