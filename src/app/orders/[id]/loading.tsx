/** Shown the instant an order is opened, while the server loads it. */
export default function OrderLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading order">
      <div className="h-4 w-28 animate-pulse rounded bg-surface-2" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="h-8 w-64 max-w-full animate-pulse rounded bg-surface-2" />
          <div className="mt-2 h-4 w-24 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="h-8 w-32 animate-pulse rounded-full bg-surface-2" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-10 w-28 animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
      {[5, 3, 4, 3].map((rows, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-5">
          <div className="h-5 w-48 animate-pulse rounded bg-surface-2" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: rows }, (_, n) => (
              <div key={n} className="h-10 animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
