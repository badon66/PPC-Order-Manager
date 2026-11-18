/** Shown the instant Sales is clicked, while the server loads the lists. */
export default function SalesLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading sales">
      <div>
        <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
        <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded bg-surface-2" />
      </div>
      <div className="h-24 animate-pulse rounded-xl border border-line bg-surface" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}
