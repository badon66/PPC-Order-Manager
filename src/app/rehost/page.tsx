import Link from 'next/link';
import { repo } from '@/lib/data';
import { RehostRunner } from './runner';

export const dynamic = 'force-dynamic';

/**
 * Artwork rescue page.
 *
 * The Base44 import brought orders, rosters and artwork *records* across, but
 * the files themselves still sit on base44.app. When that app is switched off
 * every logo, crest and font on those orders dies with it.
 *
 * Nothing on the server can fix this: neither the app host nor the build
 * environment has a route to base44.app. Only a logged-in browser does. So the
 * browser fetches each file and hands the bytes back to this app, which stores
 * them under public/uploads and rewrites the record.
 *
 * Safe to re-run: assets already pointing at /uploads/ are skipped, and a
 * failed file just stays external until the next run.
 */
export default async function RehostPage() {
  const orders = await repo.listOrders({ status: 'all', includeCompleted: true });

  const external: Array<{ id: string; url: string; team: string; role: string }> = [];
  let local = 0;

  for (const o of orders) {
    const bundle = await repo.getOrder(o.id);
    for (const a of bundle?.assets ?? []) {
      if (/^https?:\/\//i.test(a.fileUrl)) {
        external.push({ id: a.id, url: a.fileUrl, team: o.teamName || o.invoiceNumber || 'Untitled', role: a.role });
      } else if (a.fileUrl) {
        local += 1;
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/orders" className="text-sm font-semibold text-muted hover:text-ppc-gold">
        ← Back to Orders
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Rescue Base44 artwork</h1>
        <p className="mt-2 text-sm text-muted">
          These files still live on Base44. Once that app is switched off they&apos;re gone. This
          copies every one of them into this app, then points the orders at the local copy.
        </p>
        <p className="mt-2 text-sm text-muted">
          Leave the tab open while it runs — your browser is doing the fetching. Re-running is
          safe: anything already copied is skipped.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="text-2xl font-bold text-ppc-gold">{external.length}</div>
          <div className="text-sm text-muted">still on Base44</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="text-2xl font-bold">{local}</div>
          <div className="text-sm text-muted">already copied here</div>
        </div>
      </div>

      {external.length === 0 ? (
        <div className="rounded-xl border border-ppc-gold/50 bg-ppc-gold/[0.06] p-6 text-center">
          <p className="font-semibold text-ppc-gold">Everything&apos;s local.</p>
          <p className="mt-1 text-sm text-muted">
            No artwork depends on Base44 any more — it can be retired safely.
          </p>
        </div>
      ) : (
        <RehostRunner assets={external} />
      )}
    </div>
  );
}
