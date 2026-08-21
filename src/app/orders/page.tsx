import Link from 'next/link';
import { repo } from '@/lib/data';
import { computeTotals, shipToSummary } from '@/lib/order-utils';
import { formatShort } from '@/lib/dates';
import { JERSEY_TYPE_LABELS, STATUS_META, STATUS_OPTIONS } from '@/lib/constants';
import { Button, Card, EmptyState, StatusBadge } from '@/components/ui';
import { NewOrderButton } from '@/components/new-order-button';
import type { Order, OrderStatus, RosterEntry } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Search = { q?: string; status?: string; completed?: string };

function OrderCard({ order, roster }: { order: Order; roster: RosterEntry[] }) {
  const totals = computeTotals(order, roster);
  const shipTo = shipToSummary(order);

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

      {order.estimatedFinishDate && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-ppc-gold px-3 py-2 text-sm font-bold text-black">
          <span>Est. Finish</span>
          <span>{formatShort(order.estimatedFinishDate)}</span>
        </div>
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

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const search = sp.q ?? '';
  const status = (sp.status as OrderStatus | 'all') || 'all';
  const includeCompleted = sp.completed === '1';

  const orders = await repo.listOrders({ search, status, includeCompleted });

  const bundles = await Promise.all(
    orders.map(async (o) => {
      const b = await repo.getOrder(o.id);
      return { order: o, roster: b?.roster ?? [] };
    }),
  );

  /*
   * Artwork imported from Base44 still points at base44.app until it's copied
   * across. That's a countdown, not a preference — those files vanish when the
   * old app is retired. The banner nags until the count is zero, then removes
   * itself.
   *
   * Counted across every order, ignoring the current search and status filter:
   * a number that shrank because you filtered the list would read as progress.
   */
  const allOrders = await repo.listOrders({ status: 'all', includeCompleted: true });
  const stillOnBase44 = (
    await Promise.all(
      allOrders.map(async (o) => {
        const b = await repo.getOrder(o.id);
        return (b?.assets ?? []).filter((a) => /^https?:\/\//i.test(a.fileUrl)).length;
      }),
    )
  ).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Order History</h1>
        <NewOrderButton label="+ New Order" />
      </div>

      {stillOnBase44 > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/50 bg-amber-500/[0.07] px-4 py-3">
          <div>
            <p className="text-sm font-bold text-amber-200">
              {stillOnBase44} artwork file{stillOnBase44 === 1 ? '' : 's'} still stored on Base44
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Logos, crests and fonts on the imported orders. They stop working when Base44 is
              switched off.
            </p>
          </div>
          <Link
            href="/rehost"
            className="rounded-lg bg-amber-400 px-3.5 py-2 text-sm font-bold text-black hover:bg-amber-300"
          >
            Copy them here
          </Link>
        </div>
      )}

      <form className="flex flex-wrap items-center gap-2" action="/orders">
        <input
          name="q"
          defaultValue={search}
          placeholder="Search by team name or invoice number..."
          className="min-w-[14rem] flex-1"
        />
        <select name="status" defaultValue={status} className="w-auto min-w-[10rem]">
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        {includeCompleted && <input type="hidden" name="completed" value="1" />}
        <Button type="submit">Search</Button>
        <Link
          href={`/orders?${new URLSearchParams({
            ...(search ? { q: search } : {}),
            ...(status !== 'all' ? { status } : {}),
            ...(includeCompleted ? {} : { completed: '1' }),
          })}`}
          className={`inline-flex items-center rounded-lg border px-3.5 py-2 text-sm font-semibold ${
            includeCompleted
              ? 'border-ppc-gold bg-ppc-gold/10 text-ppc-gold'
              : 'border-line bg-surface-2 hover:border-ppc-gold/60'
          }`}
        >
          {includeCompleted ? 'Hide Completed' : 'Show Completed'}
        </Link>
      </form>

      {bundles.length === 0 ? (
        <EmptyState
          title="No orders match."
          hint="Try clearing the search or switching the status filter."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bundles.map(({ order, roster }) => (
            <OrderCard key={order.id} order={order} roster={roster} />
          ))}
        </div>
      )}
    </div>
  );
}
