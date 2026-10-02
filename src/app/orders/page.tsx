import Link from 'next/link';
import { repo } from '@/lib/data';
import { computeTotals, shipToSummary } from '@/lib/order-utils';
import { dueLabel, dueStatus, formatShort, today } from '@/lib/dates';
import {
  DUE_SOON_WINDOW_DAYS, JERSEY_TYPE_LABELS, OPEN_STATUSES, STATUS_META, STATUS_OPTIONS, statusBucket,
} from '@/lib/constants';
import { Button, Card, EmptyState, StatusBadge, WebsiteBadge } from '@/components/ui';
import { NewOrderButton } from '@/components/new-order-button';
import type { Order, OrderStatus, RosterEntry } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The order board.
 *
 * One grid of every open job, earliest stage at the top and In Production and
 * beyond at the bottom. No section headers: with twelve statuses the headers
 * were most of the page, and the cards' own status badges already say what
 * stage each one is at.
 *
 * The row of buttons across the top is one per stage with its live count.
 * Pressing one PINS that stage's jobs to the top of the grid; everything else
 * stays underneath in its usual order. It's a "bring these to me", not a
 * filter that hides the rest, so you never lose sight of the board. Press it
 * again to unpin.
 *
 * Completed jobs stay behind a toggle. They're reference, not work.
 */

type Search = {
  q?: string;
  /** Pin one stage's jobs to the top of the grid. */
  pin?: string;
  /** Show finished ones too. `completed=1` is kept from the old URL shape. */
  completed?: string;
};

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

function OrderCard({ order, roster, now }: { order: Order; roster: RosterEntry[]; now: string }) {
  const totals = computeTotals(order, roster);
  const shipTo = shipToSummary(order);
  const bucket = statusBucket(order.status);
  const due = dueStatus(order.estimatedFinishDate, DUE_SOON_WINDOW_DAYS, now);

  /*
   * The finish date used to be a gold bar whatever the date said, so a job
   * three weeks late looked exactly like one due in March. It's the single
   * most decision-shaped fact on the card, so it's coloured by what it means.
   *
   * Urgency is only claimed for live jobs. A draft carrying a date from six
   * weeks ago is not late — nobody is waiting on it — and painting it red
   * teaches you to ignore red on the cards where it does mean something.
   */
  const urgent = bucket === 'active';
  const dueTone = !urgent
    ? 'bg-surface-2 text-muted border border-line'
    : due === 'overdue'
      ? 'bg-red-500 text-white'
      : due === 'due-soon'
        ? 'bg-amber-400 text-black'
        : 'bg-ppc-gold text-black';

  return (
    <Card className="flex flex-col p-4 transition-colors hover:border-ppc-gold/50">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-bold leading-tight">{order.teamName || 'Untitled order'}</h3>
        <div className="flex items-center gap-1.5">
          {order.source === 'website' && <WebsiteBadge />}
          <StatusBadge status={order.status} />
        </div>
      </div>

      <dl className="mt-3 space-y-1.5 text-sm">
        <Row label="Invoice" value={order.invoiceNumber || '—'} />
        <Row
          label="Jersey Type"
          value={order.jerseyType ? JERSEY_TYPE_LABELS[order.jerseyType] : 'N/A'}
        />
        <Row label="Total Jerseys" value={String(totals.totalJerseys)} />
        {shipTo && <Row label="Ship To" value={shipTo} />}
      </dl>

      {order.estimatedFinishDate ? (
        <div
          className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold ${dueTone}`}
        >
          <span>{formatShort(order.estimatedFinishDate)}</span>
          <span>{urgent ? dueLabel(order.estimatedFinishDate, now) : 'Est. finish'}</span>
        </div>
      ) : (
        /*
         * Named rather than left blank. A live job with no finish date is a
         * thing to fix, not a gap in the layout — it's also invisible to the
         * production queue until someone sets one.
         */
        bucket === 'active' && (
          <div className="mt-3 rounded-lg border border-dashed border-line px-3 py-2 text-sm font-semibold text-muted">
            No finish date set
          </div>
        )
      )}

      {totals.mismatch && (
        <p className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200">
          Roster and set quantities disagree
        </p>
      )}

      <p className="mt-3 text-xs text-muted">Updated {formatShort(order.updatedAt.slice(0, 10))}</p>

      <div className="mt-3 flex gap-2 border-t border-line pt-3">
        <Button href={`/orders/${order.id}/edit`} className="flex-1">
          Edit
        </Button>
        <Button href={`/orders/${order.id}`} variant="primary" className="flex-1">
          View Details
        </Button>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

/** One stage, its count, and whether it's pinned to the top of the grid. */
function StageButton({
  status,
  count,
  href,
  pinned,
}: {
  status: OrderStatus;
  count: number;
  href: string;
  pinned: boolean;
}) {
  const meta = STATUS_META[status];
  const skin = pinned
    ? 'border-ppc-gold bg-ppc-gold/15 text-ppc-gold'
    : count === 0
      ? 'border-line bg-surface-2/40 text-muted opacity-50'
      : 'border-line bg-surface-2 hover:border-ppc-gold/60';
  return (
    <Link
      href={href}
      aria-pressed={pinned}
      title={pinned ? `Unpin ${meta.label}` : `Bring ${meta.label} to the top`}
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${skin}`}
    >
      <span aria-hidden>{meta.emoji}</span>
      {meta.label}
      <span
        className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${
          pinned ? 'bg-ppc-gold text-black' : count ? 'bg-surface text-fg' : 'text-muted'
        }`}
      >
        {count}
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const search = sp.q ?? '';
  const pin = (STATUS_OPTIONS as string[]).includes(sp.pin ?? '') ? (sp.pin as OrderStatus) : null;
  const showCompleted = sp.completed === '1' || pin === 'completed';
  const now = today();

  // Everything is fetched, then counted here: a button's count has to describe
  // the rows behind it, and that can't be computed from rows a query dropped.
  const all = await repo.listOrders({ status: 'all', includeCompleted: true, search });
  const countOf = (s: OrderStatus) => all.filter((o) => o.status === s).length;
  const openCount = all.filter((o) => statusBucket(o.status) !== 'completed').length;
  const completedCount = countOf('completed');

  const linkTo = (patch: Partial<Record<'pin' | 'completed', string | null>>) => {
    const p = new URLSearchParams();
    if (search) p.set('q', search);
    const nextPin = 'pin' in patch ? patch.pin : pin;
    const nextCompleted = 'completed' in patch ? patch.completed : showCompleted ? '1' : null;
    if (nextPin) p.set('pin', nextPin);
    if (nextCompleted) p.set('completed', '1');
    const qs = p.toString();
    return qs ? `/orders?${qs}` : '/orders';
  };

  const visible: OrderStatus[] = showCompleted ? [...OPEN_STATUSES, 'completed'] : OPEN_STATUSES;
  const shown = all.filter((o) => visible.includes(o.status));

  // Rosters only for what's rendered.
  const bundles = await Promise.all(
    shown.map(async (o) => {
      const b = await repo.getOrder(o.id);
      return { order: o, roster: b?.roster ?? [] };
    }),
  );

  /*
   * One sort, three keys: the pinned stage first, then pipeline position
   * (earliest stage at the top, In Production and beyond at the bottom), then
   * soonest finish date within a stage with undated ones last.
   */
  const rank = (s: OrderStatus) => (pin && s === pin ? -1 : STATUS_META[s].order);
  bundles.sort((a, b) => {
    const r = rank(a.order.status) - rank(b.order.status);
    if (r !== 0) return r;
    const da = a.order.estimatedFinishDate ?? '';
    const db2 = b.order.estimatedFinishDate ?? '';
    if (da && db2 && da !== db2) return da.localeCompare(db2);
    if (da !== db2) return da ? -1 : 1;
    return b.order.updatedAt.localeCompare(a.order.updatedAt);
  });

  // The buttons, in pipeline order; Completed last, and it doubles as the
  // toggle that reveals finished work.
  const stageButtons = STATUS_OPTIONS.filter((s) => s !== 'completed');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-sm text-muted">
            {openCount} open job{openCount === 1 ? '' : 's'}
            {search && ` matching “${search}”`}
          </p>
        </div>
        <NewOrderButton label="+ New Order" />
      </div>

      <div className="flex flex-wrap gap-2">
        {stageButtons.map((s) => (
          <StageButton
            key={s}
            status={s}
            count={countOf(s)}
            pinned={pin === s}
            href={linkTo({ pin: pin === s ? null : s })}
          />
        ))}
        <StageButton
          status="completed"
          count={completedCount}
          pinned={showCompleted}
          href={linkTo({ pin: null, completed: showCompleted ? null : '1' })}
        />
      </div>

      <form className="flex items-center gap-2" action="/orders">
        <input
          name="q"
          defaultValue={search}
          placeholder="Search by team name or invoice number..."
          className="min-w-[12rem] flex-1"
        />
        {pin && <input type="hidden" name="pin" value={pin} />}
        {showCompleted && <input type="hidden" name="completed" value="1" />}
        <Button type="submit">Search</Button>
      </form>

      {pin && pin !== 'completed' && (
        <p className="text-sm text-muted">
          <span className="font-semibold text-ppc-gold">{STATUS_META[pin].label}</span> pinned to the top.{' '}
          <Link href={linkTo({ pin: null })} className="font-semibold text-ppc-gold hover:underline">
            Unpin
          </Link>
        </p>
      )}

      {bundles.length === 0 ? (
        <EmptyState
          title={search ? 'Nothing matches that search.' : 'No open jobs right now.'}
          hint={search ? 'Try a different team name or invoice number.' : 'Start a new order, or show Completed to see finished work.'}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {bundles.map(({ order, roster }) => (
            <OrderCard key={order.id} order={order} roster={roster} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
