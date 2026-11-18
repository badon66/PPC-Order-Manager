/** Shown the instant History is clicked, while the server loads the change log. */
export default function OrderHistoryLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading history">
      <div className="h-4 w-36 animate-pulse rounded bg-surface-2" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="h-8 w-64 max-w-full animate-pulse rounded bg-surface-2" />
          <div className="mt-2 h-4 w-40 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="h-8 w-32 animate-pulse rounded-full bg-surface-2" />
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-5">
          <div className="h-5 w-40 animate-pulse rounded bg-surface-2" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }, (_, n) => (
              <div key={n} className="h-4 animate-pulse rounded bg-surface-2" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
