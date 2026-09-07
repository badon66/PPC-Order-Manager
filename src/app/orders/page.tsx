import Link from 'next/link';
import { repo } from '@/lib/data';
import { computeTotals, shipToSummary } from '@/lib/order-utils';
import { dueLabel, dueStatus, formatShort, today } from '@/lib/dates';
import {
  ACTIVE_STATUSES, DUE_SOON_WINDOW_DAYS, JERSEY_TYPE_LABELS, STATUS_META,
  UNFINALIZED_STATUSES, statusBucket,
} from '@/lib/constants';
import { Button, Card, EmptyState, StatusBadge } from '@/components/ui';
import { NewOrderButton } from '@/components/new-order-button';
import type { Order, OrderStatus, RosterEntry } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The order board.
 *
 * This page answers "what am I working on", not "what have I ever made". By
 * default it shows only live jobs — the four stages where something is owed to
 * somebody — and the finished and not-yet-real ones sit behind toggles that
 * say how many they're hiding.
 *
 * The old version was one flat grid sorted by last-touched, with completed
 * orders behind a toggle. On a list of 18 that's a wall; twelve of them were
 * finished work. Grouping by stage and defaulting to active turns the same
 * data into a pipeline you can read in one look.
 */

type Search = {
  q?: string;
  /** Drill into one stage from the pipeline strip. */
  stage?: string;
  /** Show the not-yet-real ones too. */
  unfinalized?: string;
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
        <StatusBadge status={order.status} />
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

/** A stage chip in the pipeline strip: label, count, and its own on state. */
function StageChip({
  label,
  count,
  href,
  active,
  tone = 'default',
}: {
  label: string;
  count: number;
  href: string;
  active: boolean;
  tone?: 'default' | 'muted';
}) {
  const base = 'flex min-w-[7.5rem] flex-1 flex-col rounded-xl border px-3 py-2.5 text-left transition-colors';
  const skin = active
    ? 'border-ppc-gold bg-ppc-gold/10'
    : count === 0
      ? 'border-line bg-surface-2/50 opacity-50'
      : 'border-line bg-surface-2 hover:border-ppc-gold/60';
  return (
    <Link href={href} className={`${base} ${skin}`}>
      <span
        className={`text-xl font-bold tabular-nums ${
          active ? 'text-ppc-gold' : tone === 'muted' ? 'text-muted' : ''
        }`}
      >
        {count}
      </span>
      <span className="text-[0.7rem] font-semibold uppercase leading-tight tracking-wide text-muted">
        {label}
      </span>
    </Link>
  );
}

/** A show/hide switch for a whole bucket, which says what it's hiding. */
function BucketToggle({ label, count, href, on }: { label: string; count: number; href: string; on: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-semibold sm:flex-none ${
        on ? 'border-ppc-gold bg-ppc-gold/10 text-ppc-gold' : 'border-line bg-surface-2 hover:border-ppc-gold/60'
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${on ? 'bg-ppc-gold' : 'bg-neutral-600'}`}
        aria-hidden
      />
      {label}
      <span className="tabular-nums text-muted">{count}</span>
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const search = sp.q ?? '';
  const stage = (ACTIVE_STATUSES as string[]).concat(UNFINALIZED_STATUSES, 'completed').includes(sp.stage ?? '')
    ? (sp.stage as OrderStatus)
    : null;
  const showUnfinalized = sp.unfinalized === '1';
  const showCompleted = sp.completed === '1';
  const now = today();

  /*
   * Everything is fetched, then bucketed here rather than filtered in the
   * store. The counts on the chips have to describe what's behind them, and a
   * count can't be computed from rows the query already dropped.
   */
  const all = await repo.listOrders({ status: 'all', includeCompleted: true, search });

  const countOf = (s: OrderStatus) => all.filter((o) => o.status === s).length;
  const unfinalizedCount = all.filter((o) => statusBucket(o.status) === 'unfinalized').length;
  const completedCount = all.filter((o) => statusBucket(o.status) === 'completed').length;
  const activeCount = all.filter((o) => statusBucket(o.status) === 'active').length;

  /** Build a URL that keeps everything except what's being changed. */
  const linkTo = (patch: Partial<Record<'stage' | 'unfinalized' | 'completed', string | null>>) => {
    const p = new URLSearchParams();
    if (search) p.set('q', search);
    const next = {
      stage: 'stage' in patch ? patch.stage : stage,
      unfinalized: 'unfinalized' in patch ? patch.unfinalized : showUnfinalized ? '1' : null,
      completed: 'completed' in patch ? patch.completed : showCompleted ? '1' : null,
    };
    if (next.stage) p.set('stage', next.stage);
    if (next.unfinalized) p.set('unfinalized', '1');
    if (next.completed) p.set('completed', '1');
    const qs = p.toString();
    return qs ? `/orders?${qs}` : '/orders';
  };

  /*
   * Which statuses are on screen. Drilling into one stage overrides the
   * toggles — you asked for that stage, so that's what you get.
   */
  const visible: OrderStatus[] = stage
    ? [stage]
    : [
        ...(showUnfinalized ? UNFINALIZED_STATUSES : []),
        ...ACTIVE_STATUSES,
        ...(showCompleted ? (['completed'] as OrderStatus[]) : []),
      ];

  const shown = all.filter((o) => visible.includes(o.status));

  // Rosters only for what's rendered — the full set is 135 assets and 200+
  // roster rows, and none of it is needed to count a chip.
  const bundles = await Promise.all(
    shown.map(async (o) => {
      const b = await repo.getOrder(o.id);
      return { order: o, roster: b?.roster ?? [] };
    }),
  );

  /*
   * Within a stage, soonest deadline first — that's the order the work has to
   * be done in. Undated ones go last rather than first, where an empty string
   * would sort them.
   */
  const groups = visible
    .map((s) => ({
      status: s,
      rows: bundles
        .filter((b) => b.order.status === s)
        .sort((a, b) => {
          const da = a.order.estimatedFinishDate ?? '';
          const db2 = b.order.estimatedFinishDate ?? '';
          if (da && db2 && da !== db2) return da.localeCompare(db2);
          if (da !== db2) return da ? -1 : 1;
          return b.order.updatedAt.localeCompare(a.order.updatedAt);
        }),
    }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-5">
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
        * The pipeline, left to right in the order work moves through it.
        * Two-up on a phone rather than wrapped: four chips in a flex row left
        * a lone orphan on the second line every time.
        */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ACTIVE_STATUSES.map((s) => (
          <StageChip
            key={s}
            label={STATUS_META[s].label}
            count={countOf(s)}
            active={stage === s}
            href={linkTo({ stage: stage === s ? null : s })}
          />
        ))}
      </div>

      {/*
        * Search and the bucket switches share a row on a laptop and stack on a
        * phone. Left to wrap on its own, the Search button landed on a line of
        * its own between the two toggles.
        */}
      <div className="space-y-2 sm:flex sm:items-center sm:gap-2 sm:space-y-0">
        <form className="flex items-center gap-2 sm:flex-1" action="/orders">
          <input
            name="q"
            defaultValue={search}
            placeholder="Search by team name or invoice number..."
            className="min-w-[12rem] flex-1"
          />
          {stage && <input type="hidden" name="stage" value={stage} />}
          {showUnfinalized && <input type="hidden" name="unfinalized" value="1" />}
          {showCompleted && <input type="hidden" name="completed" value="1" />}
          <Button type="submit">Search</Button>
        </form>

        <div className="flex gap-2">
        <BucketToggle
          label="Not finalized"
          count={unfinalizedCount}
          on={showUnfinalized}
          href={linkTo({ stage: null, unfinalized: showUnfinalized ? null : '1' })}
        />
        <BucketToggle
          label="Completed"
          count={completedCount}
          on={showCompleted}
          href={linkTo({ stage: null, completed: showCompleted ? null : '1' })}
        />
        </div>
      </div>

      {stage && (
        <p className="text-sm text-muted">
          Showing <span className="font-semibold text-fg">{STATUS_META[stage].label}</span> only.{' '}
          <Link href={linkTo({ stage: null })} className="font-semibold text-ppc-gold hover:underline">
            Back to all live jobs
          </Link>
        </p>
      )}

      {groups.length === 0 ? (
        <EmptyState
          title={search ? 'Nothing matches that search.' : 'No live jobs right now.'}
          hint={
            search
              ? 'Try a different team name or invoice number, or switch on the other buckets.'
              : 'Switch on “Not finalized” or “Completed” to see the rest, or start a new order.'
          }
        />
      ) : (
        groups.map((g) => (
          <section key={g.status} className="space-y-3">
            <div className="flex items-baseline gap-2 border-b border-line pb-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-ppc-gold">
                {STATUS_META[g.status].label}
              </h2>
              <span className="text-sm tabular-nums text-muted">{g.rows.length}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.rows.map(({ order, roster }) => (
                <OrderCard key={order.id} order={order} roster={roster} now={now} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
