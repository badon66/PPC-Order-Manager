import Link from 'next/link';
import { repo } from '@/lib/data';
import { computeTotals, shipToSummary } from '@/lib/order-utils';
import { dueLabel, dueStatus, formatShort, today } from '@/lib/dates';
import {
  ACTIVE_STATUSES, DUE_SOON_WINDOW_DAYS, JERSEY_TYPE_LABELS, STATUS_META, UNFINALIZED_STATUSES, statusBucket,
} from '@/lib/constants';
import { formatCad, isOverridden, orderValueOf } from '@/lib/pricing';
import { OrderCardShell } from '@/components/order-card-shell';
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
  /** Show drafts (incomplete + draft) too. */
  drafts?: string;
  /** Show finished ones too. `completed=1` is kept from the old URL shape. */
  completed?: string;
  /** Which completed ones: month | last | two | year | all. */
  range?: string;
};

/** Completed-date windows, as offered in the Completed dropdown. */
const RANGES = [
  ['month', 'This month'],
  ['last', 'Last month'],
  ['two', 'Two months ago'],
  ['year', 'This year'],
  ['all', 'All time'],
] as const;
type Range = (typeof RANGES)[number][0];

/** [first day, last day] of a window, inclusive, as ISO dates. */
function windowFor(range: Range, now: string): [string, string] | null {
  const [y, m] = now.split('-').map(Number);
  const iso = (yy: number, mm: number, d: number) =>
    `${yy}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const month = (offset: number): [string, string] => {
    const d = new Date(Date.UTC(y, m - 1 - offset, 1));
    const yy = d.getUTCFullYear();
    const mm = d.getUTCMonth() + 1;
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return [iso(yy, mm, 1), iso(yy, mm, last)];
  };
  switch (range) {
    case 'month': return month(0);
    case 'last': return month(1);
    case 'two': return month(2);
    case 'year': return [iso(y, 1, 1), iso(y, 12, 31)];
    default: return null;
  }
}

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
    <OrderCardShell order={order}>
    <Card className="flex h-full flex-col p-4 transition-colors hover:border-ppc-gold/50">
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
        {/* Keenan's board only. This card never renders on a public page. */}
        {STATUS_META[order.status].order >= STATUS_META.design_talk.order && (
          <Row label={isOverridden(order) ? 'Value (set)' : 'Value'} value={formatCad(orderValueOf(order))} />
        )}
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
    </OrderCardShell>
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

/*
 * One chip, three uses: a stage button, the Drafts summary, the Completed
 * summary. The dropdowns used to be a size smaller than the button beside
 * them, which read as two different kinds of thing. They aren't.
 */
const CHIP =
  'inline-flex h-10 cursor-pointer list-none items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold transition-colors';
const CHIP_ON = 'border-ppc-gold bg-ppc-gold/15 text-ppc-gold';
const CHIP_OFF = 'border-line bg-surface-2 hover:border-ppc-gold/60';
const CHIP_EMPTY = 'border-line bg-surface-2/40 text-muted opacity-50';
const COUNT = 'rounded-md px-1.5 py-0.5 text-xs tabular-nums';
const COUNT_ON = 'bg-ppc-gold text-black';

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
  const skin = pinned ? CHIP_ON : count === 0 ? CHIP_EMPTY : CHIP_OFF;
  return (
    <Link
      href={href}
      aria-pressed={pinned}
      title={pinned ? `Unpin ${meta.label}` : `Bring ${meta.label} to the top`}
      className={`${CHIP} ${skin}`}
    >
      <span aria-hidden>{meta.emoji}</span>
      {meta.label}
      <span className={`${COUNT} ${pinned ? COUNT_ON : count ? 'bg-surface text-fg' : 'text-muted'}`}>{count}</span>
    </Link>
  );
}

/** Same height as the chips it sits beside. Label and figure on one line; the hint on hover. */
function Money({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div
      title={hint}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-sm"
    >
      <span className="text-[0.65rem] font-bold uppercase tracking-wide text-muted">{label}</span>
      <span className="font-bold tabular-nums text-ppc-gold">{formatCad(value)}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

const PRICED_FROM = STATUS_META.design_talk.order;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const search = sp.q ?? '';
  const allStatuses = [...UNFINALIZED_STATUSES, ...ACTIVE_STATUSES, 'completed' as OrderStatus];
  const pin = (allStatuses as string[]).includes(sp.pin ?? '') ? (sp.pin as OrderStatus) : null;
  const showDrafts = sp.drafts === '1' || (pin !== null && (UNFINALIZED_STATUSES as string[]).includes(pin));
  const showCompleted = sp.completed === '1' || pin === 'completed';
  const range: Range = (RANGES.map((r) => r[0]) as string[]).includes(sp.range ?? '') ? (sp.range as Range) : 'month';
  const now = today();

  const all = await repo.listOrders({ status: 'all', includeCompleted: true, search });
  const countOf = (s: OrderStatus) => all.filter((o) => o.status === s).length;
  const draftsCount = all.filter((o) => statusBucket(o.status) === 'unfinalized').length;

  /*
   * Money, Keenan's eyes only (this page is behind the access code).
   *   outgoing  every open job from Design Talk on — what's in the pipeline
   *   YTD       completed this calendar year, by the day it was completed
   * An unpriced order contributes nothing, and says so in the hint.
   */
  const priced = (o: Order) => orderValueOf(o) ?? 0;
  const openPriced = all.filter((o) => statusBucket(o.status) !== 'completed' && STATUS_META[o.status].order >= PRICED_FROM);
  const outgoing = openPriced.reduce((n, o) => n + priced(o), 0);
  const unpriced = openPriced.filter((o) => orderValueOf(o) === null).length;
  const yearStart = `${now.slice(0, 4)}-01-01`;
  const ytdOrders = all.filter((o) => o.status === 'completed' && (o.completedAt ?? '') >= yearStart);
  const ytd = ytdOrders.reduce((n, o) => n + priced(o), 0);

  // Completed, windowed by the day it was marked complete.
  const win = windowFor(range, now);
  const completedInRange = all.filter(
    (o) => o.status === 'completed' && (!win || ((o.completedAt ?? '') >= win[0] && (o.completedAt ?? '') <= win[1])),
  );

  const linkTo = (patch: Partial<Record<'pin' | 'drafts' | 'completed' | 'range', string | null>>) => {
    const p = new URLSearchParams();
    if (search) p.set('q', search);
    const next = {
      pin: 'pin' in patch ? patch.pin : pin,
      drafts: 'drafts' in patch ? patch.drafts : showDrafts ? '1' : null,
      completed: 'completed' in patch ? patch.completed : showCompleted ? '1' : null,
      range: 'range' in patch ? patch.range : range !== 'month' ? range : null,
    };
    if (next.pin) p.set('pin', next.pin);
    if (next.drafts) p.set('drafts', '1');
    if (next.completed) p.set('completed', '1');
    if (next.range) p.set('range', next.range);
    const qs = p.toString();
    return qs ? `/orders?${qs}` : '/orders';
  };

  const shown = [
    ...all.filter((o) => (ACTIVE_STATUSES as string[]).includes(o.status)),
    ...(showDrafts ? all.filter((o) => statusBucket(o.status) === 'unfinalized') : []),
    ...(showCompleted ? completedInRange : []),
  ];

  const bundles = await Promise.all(
    shown.map(async (o) => {
      const b = await repo.getOrder(o.id);
      return { order: o, roster: b?.roster ?? [] };
    }),
  );

  // Pinned stage first; then pipeline position; then soonest finish date.
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

  // The working stages across the top; In Production and Completed sit with
  // search, because that's where the eye goes to find a specific job.
  const topStages = ACTIVE_STATUSES.filter((s) => s !== 'in_production');
  const activeCount = all.filter((o) => statusBucket(o.status) === 'active').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-sm text-muted">
            {activeCount} live job{activeCount === 1 ? '' : 's'}
            {search && ` matching “${search}”`}
          </p>
        </div>
        <NewOrderButton label="+ New Order" />
      </div>

      {/*
        * Row one: every stage you can pin, left, spread across the width;
        * money on the right. Row two: the search box takes the whole width
        * the grid below it has, with In Production, Drafts and Completed in
        * one matching set at its right end.
        */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {topStages.map((s) => (
            <StageButton key={s} status={s} count={countOf(s)} pinned={pin === s} href={linkTo({ pin: pin === s ? null : s })} />
          ))}
        </div>
        <div className="flex shrink-0 gap-2">
          <Money label="Outgoing" value={outgoing} hint={unpriced ? `${unpriced} unpriced` : `${openPriced.length} open jobs`} />
          <Money label="Year to date" value={ytd} hint={`${ytdOrders.length} completed in ${now.slice(0, 4)}`} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form className="flex min-w-[16rem] flex-1 items-center gap-2" action="/orders">
          <input name="q" defaultValue={search} placeholder="Search by team name or invoice number…" className="flex-1" />
          {pin && <input type="hidden" name="pin" value={pin} />}
          {showDrafts && <input type="hidden" name="drafts" value="1" />}
          {showCompleted && <input type="hidden" name="completed" value="1" />}
          {range !== 'month' && <input type="hidden" name="range" value={range} />}
          <Button type="submit">Search</Button>
        </form>

        <div className="flex shrink-0 gap-2">
          <StageButton status="in_production" count={countOf('in_production')} pinned={pin === 'in_production'} href={linkTo({ pin: pin === 'in_production' ? null : 'in_production' })} />

          <details className="relative">
            <summary className={`${CHIP} ${showDrafts ? CHIP_ON : CHIP_OFF}`}>
              <span aria-hidden>{STATUS_META.draft.emoji}</span>
              Drafts
              <span className={`${COUNT} ${showDrafts ? COUNT_ON : 'bg-surface text-fg'}`}>{draftsCount}</span>
              <span aria-hidden className="text-xs">▾</span>
            </summary>
            <div className="absolute right-0 z-30 mt-1 flex w-56 flex-col gap-1 rounded-lg border border-line bg-surface p-1.5 shadow-xl">
              {UNFINALIZED_STATUSES.map((s) => (
                <StageButton key={s} status={s} count={countOf(s)} pinned={pin === s} href={linkTo({ pin: pin === s ? null : s, drafts: '1' })} />
              ))}
              <Link href={linkTo({ pin: null, drafts: showDrafts ? null : '1' })} className="px-2 py-1 text-xs text-muted hover:text-ppc-gold">
                {showDrafts ? 'Hide drafts' : 'Show all drafts'}
              </Link>
            </div>
          </details>

          <details className="relative">
            <summary className={`${CHIP} ${showCompleted ? CHIP_ON : CHIP_OFF}`}>
              <span aria-hidden>{STATUS_META.completed.emoji}</span>
              Completed
              <span className={`${COUNT} ${showCompleted ? COUNT_ON : 'bg-surface text-fg'}`}>{completedInRange.length}</span>
              <span aria-hidden className="text-xs">▾</span>
            </summary>
            <div className="absolute right-0 z-30 mt-1 w-52 rounded-lg border border-line bg-surface p-1.5 shadow-xl">
              <div className="px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-muted">Date completed</div>
              {RANGES.map(([key, label]) => (
                <Link
                  key={key}
                  href={linkTo({ pin: null, completed: '1', range: key === 'month' ? null : key })}
                  className={`block rounded px-2 py-1 text-sm ${showCompleted && range === key ? 'bg-ppc-gold/15 font-semibold text-ppc-gold' : 'hover:bg-surface-2'}`}
                >
                  {label}
                </Link>
              ))}
              {showCompleted && (
                <Link href={linkTo({ pin: null, completed: null, range: null })} className="mt-1 block border-t border-line px-2 py-1 text-xs text-muted hover:text-ppc-gold">
                  Hide completed
                </Link>
              )}
            </div>
          </details>
        </div>
      </div>

      {pin && (
        <p className="text-sm text-muted">
          <span className="font-semibold text-ppc-gold">{STATUS_META[pin].label}</span> pinned to the top.{' '}
          <Link href={linkTo({ pin: null })} className="font-semibold text-ppc-gold hover:underline">Unpin</Link>
        </p>
      )}

      {bundles.length === 0 ? (
        <EmptyState
          title={search ? 'Nothing matches that search.' : 'No live jobs right now.'}
          hint={search ? 'Try a different team name or invoice number.' : 'Start a new order, or open Drafts or Completed.'}
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
