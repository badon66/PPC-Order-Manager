/** Shown the instant a factory page is clicked, while the server answers. */
export default function FactoryLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-40 rounded bg-surface-2" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="h-72 rounded-xl border border-line bg-surface" />
        <div className="space-y-4">
          <div className="h-40 rounded-xl border border-line bg-surface" />
          <div className="h-40 rounded-xl border border-line bg-surface" />
        </div>
      </div>
    </div>
  );
}
