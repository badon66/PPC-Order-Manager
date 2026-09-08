import { repo } from '@/lib/data';
import { currentUser } from '@/lib/auth';
import { today } from '@/lib/dates';
import { BUSINESS_TIMEZONE } from '@/lib/constants';
import { Card, EmptyState } from '@/components/ui';
import { CallerNameField } from '@/components/sales/caller-name-field';
import { UploadForm } from '@/components/sales/upload-form';
import { ListCard } from '@/components/sales/list-card';

export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  const user = await currentUser();
  const lists = await repo.listCallLists();
  const bundles = (await Promise.all(lists.map((l) => repo.getCallList(l.id)))).filter((b) => b !== null);
  const day = today(BUSINESS_TIMEZONE);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          <p className="text-sm text-muted">Cold calling. Upload a list, start at the top, log every call.</p>
        </div>
        <CallerNameField fallback={user?.name ?? ''} />
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ppc-gold">New call list</h2>
        <UploadForm />
      </Card>

      <section className="space-y-3">
        <div className="flex items-baseline gap-2 border-b border-line pb-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ppc-gold">Your lists</h2>
          <span className="text-sm tabular-nums text-muted">{bundles.length}</span>
        </div>
        {bundles.length === 0 ? (
          <EmptyState title="No call lists yet" hint="Fill in the blank template and upload it above." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {bundles.map((b) => <ListCard key={b.list.id} list={b.list} contacts={b.contacts} today={day} />)}
          </div>
        )}
      </section>
    </div>
  );
}
