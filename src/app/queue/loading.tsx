/** Shown the instant Production is clicked, while the server builds the queue. */
export default function QueueLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading production queue">
      <div>
        <h1 className="text-2xl font-bold">Production Queue</h1>
        <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-surface-2" />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-5 w-40 animate-pulse rounded bg-surface-2" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border border-line bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
