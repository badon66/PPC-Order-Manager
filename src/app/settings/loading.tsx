/** Shown the instant Settings is clicked, while the server loads them. */
export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-5" aria-busy="true" aria-label="Loading settings">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-surface-2" />
      </div>
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="h-5 w-40 animate-pulse rounded bg-surface-2" />
        <div className="mt-4 space-y-4">
          <div className="h-24 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-10 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-16 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-10 w-36 animate-pulse rounded-lg bg-surface-2" />
        </div>
      </div>
    </div>
  );
}
