export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-8 w-56 animate-pulse rounded bg-surface-2" />
      <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
      <div className="h-64 animate-pulse rounded-xl bg-surface-2" />
    </div>
  );
}
