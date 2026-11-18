/** Shown the instant Edit is clicked, while the server loads the order into the form. */
export default function OrderEditLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading order form">
      <div className="h-4 w-28 animate-pulse rounded bg-surface-2" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-8 w-72 max-w-full animate-pulse rounded bg-surface-2" />
        <div className="h-9 w-40 animate-pulse rounded-lg bg-surface-2" />
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <div className="h-12 animate-pulse rounded-xl border border-line bg-surface lg:h-96 lg:w-60 lg:shrink-0" />
        <div className="min-w-0 flex-1 space-y-4">
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
      </div>
    </div>
  );
}
