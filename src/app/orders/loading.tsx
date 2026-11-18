/**
 * Shown the instant Orders is clicked, while the server builds the board.
 * Same outline as the page (title, stage chips, card grid) so nothing jumps
 * when the real thing arrives.
 */
export default function OrdersLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading orders">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <div className="mt-1.5 h-4 w-24 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="h-10 w-32 animate-pulse rounded-lg bg-surface-2" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-10 w-32 animate-pulse rounded-lg border border-line bg-surface-2" />
        ))}
      </div>
      <div className="h-10 animate-pulse rounded-lg border border-line bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-4">
            <div className="h-5 w-2/3 animate-pulse rounded bg-surface-2" />
            <div className="mt-3 h-2 animate-pulse rounded bg-surface-2" />
            <div className="mt-4 space-y-2.5">
              <div className="h-4 animate-pulse rounded bg-surface-2" />
              <div className="h-4 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-surface-2" />
            </div>
            <div className="mt-4 h-10 animate-pulse rounded-lg bg-surface-2" />
            <div className="mt-4 flex gap-2 border-t border-line pt-3">
              <div className="h-9 flex-1 animate-pulse rounded-lg bg-surface-2" />
              <div className="h-9 flex-1 animate-pulse rounded-lg bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
