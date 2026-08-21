import Link from 'next/link';
import { repo } from '@/lib/data';
import { dueLabel, dueStatus, formatShort, monthKey, monthLabel, today } from '@/lib/dates';
import { DUE_SOON_WINDOW_DAYS } from '@/lib/constants';
import { Card, EmptyState, StatusBadge } from '@/components/ui';
import type { Order } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Production queue. The old app was a flat card list, which answered "what
 * orders exist" but never "what's due, what's late, what ships this week".
 */

const ACTIVE = new Set(['incomplete', 'draft', 'waiting_for_payment', 'in_production', 'shipped']);

function QueueRow({ order, now }: { order: Order; now: string }) {
  const state = dueStatus(order.estimatedFinishDate, DUE_SOON_WINDOW_DAYS, now);
  const tone =
    state === 'overdue'
      ? 'border-red-500/60 bg-red-500/[0.07]'
      : state === 'due-soon'
        ? 'border-ppc-gold/60 bg-ppc-gold/[0.07]'
        : 'border-line';
  const label =
    state === 'overdue'
      ? 'text-red-300'
      : state === 'due-soon'
        ? 'text-ppc-gold'
        : 'text-muted';

  return (
    <Link href={`/orders/${order.id}`} className="block">
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3 hover:border-ppc-gold/60 ${tone}`}>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{order.teamName || 'Untitled order'}</div>
          <div className="text-xs text-muted">{order.invoiceNumber || 'No invoice number'}</div>
        </div>
        <StatusBadge status={order.status} />
        <div className="text-right">
          <div className="text-sm font-semibold">
            {order.estimatedFinishDate ? formatShort(order.estimatedFinishDate) : '—'}
          </div>
          <div className={`text-xs font-semibold ${label}`}>
            {dueLabel(order.estimatedFinishDate, now)}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default async function QueuePage() {
  const now = today();
  const all = await repo.listOrders({ status: 'all', includeCompleted: false });
  const active = all.filter((o) => ACTIVE.has(o.status));

  const overdue = active
    .filter((o) => dueStatus(o.estimatedFinishDate, DUE_SOON_WINDOW_DAYS, now) === 'overdue')
    .sort((a, b) => (a.estimatedFinishDate ?? '').localeCompare(b.estimatedFinishDate ?? ''));

  const dueSoon = active
    .filter((o) => dueStatus(o.estimatedFinishDate, DUE_SOON_WINDOW_DAYS, now) === 'due-soon')
    .sort((a, b) => (a.estimatedFinishDate ?? '').localeCompare(b.estimatedFinishDate ?? ''));

  const scheduled = active
    .filter((o) => dueStatus(o.estimatedFinishDate, DUE_SOON_WINDOW_DAYS, now) === 'scheduled')
    .sort((a, b) => (a.estimatedFinishDate ?? '').localeCompare(b.estimatedFinishDate ?? ''));

  /** Orders with no finish date get their own section rather than vanishing. */
  const undated = active.filter((o) => !o.estimatedFinishDate);

  const byMonth = new Map<string, Order[]>();
  for (const o of scheduled) {
    const k = monthKey(o.estimatedFinishDate!);
    byMonth.set(k, [...(byMonth.get(k) ?? []), o]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Production Queue</h1>
        <p className="mt-1 text-sm text-muted">
          Active orders by estimated finish date. Today is {formatShort(now)}.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Overdue" value={overdue.length} tone="danger" />
        <Tile label={`Due in ${DUE_SOON_WINDOW_DAYS} days`} value={dueSoon.length} tone="warn" />
        <Tile label="Scheduled" value={scheduled.length} />
        <Tile label="No date set" value={undated.length} />
      </div>

      {active.length === 0 && <EmptyState title="Nothing in production." />}

      <Group title="Overdue" rows={overdue} now={now} />
      <Group title={`Due within ${DUE_SOON_WINDOW_DAYS} days`} rows={dueSoon} now={now} />

      {[...byMonth.entries()].map(([k, rows]) => (
        <Group key={k} title={monthLabel(k)} rows={rows} now={now} />
      ))}

      <Group
        title="No finish date set"
        rows={undated}
        now={now}
        hint="These have nothing scheduling them. Set a date so they show up above."
      />
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'danger' | 'warn';
}) {
  const color =
    tone === 'danger' && value > 0
      ? 'text-red-300'
      : tone === 'warn' && value > 0
        ? 'text-ppc-gold'
        : '';
  return (
    <Card className="px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold tabular-nums ${color}`}>{value}</div>
    </Card>
  );
}

function Group({
  title,
  rows,
  now,
  hint,
}: {
  title: string;
  rows: Order[];
  now: string;
  hint?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ppc-gold">{title}</h2>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className="space-y-2">
        {rows.map((o) => (
          <QueueRow key={o.id} order={o} now={now} />
        ))}
      </div>
    </section>
  );
}
