'use client';

import { useState, useTransition } from 'react';
import { STATUS_META, STATUS_OPTIONS } from '@/lib/constants';
import { updateOperationalFields } from '@/app/orders/actions';
import type { OrderStatus } from '@/lib/types';

export function OperationalControls({
  orderId,
  status,
  estimatedFinishDate,
  trackingCode,
}: {
  orderId: string;
  status: OrderStatus;
  estimatedFinishDate: string | null;
  trackingCode: string;
}) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState({
    status,
    estimatedFinishDate: estimatedFinishDate ?? '',
    trackingCode,
  });

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
    <div className="grid gap-4 sm:grid-cols-3">
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
        <label className="text-xs font-medium text-muted">Estimated Finish Date</label>
        <input
          type="date"
          className="mt-1"
          value={local.estimatedFinishDate}
          disabled={pending}
          onChange={(e) => setLocal((s) => ({ ...s, estimatedFinishDate: e.target.value }))}
          onBlur={(e) => save({ estimatedFinishDate: e.target.value }, 'Finish date saved')}
        />
      </div>

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

      {(saved || error || pending) && (
        <p
          className={`sm:col-span-3 text-xs font-semibold ${
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
