import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadFactoryJob } from '@/lib/factory/load';
import { remindersFor } from '@/lib/factory/board';
import { FACTORY_TEXT as T } from '@/lib/factory/text';
import { resolveAll } from '@/lib/storage';
import { formatLong } from '@/lib/dates';
import { SheetNotes } from '@/components/sheet-notes';
import { FactoryProgress } from '@/components/factory/progress';
import { MarkSeen } from '@/components/factory/mark-seen';
import { LocalTime } from '@/components/factory/local-time';
import { FactorySheetBody } from '../../sheet-body';
import { addFactoryJobNote } from '../../actions';

export const dynamic = 'force-dynamic';

/**
 * One job. The production sheet on the left; on the right, pinned while the
 * sheet scrolls, everything the factory DOES: where the job is at, their
 * finish date, and what Powerplay changed since they last looked.
 *
 * `loadFactoryJob` answers null for anything that isn't a job the factory may
 * see, so an order id typed into the address bar opens nothing else.
 */
export default async function FactoryJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await loadFactoryJob(id);
  if (!job) notFound();
  const { view, card, notes, today } = job;

  const assets = (await resolveAll(view.assets)).map((a) => ({
    ...a,
    viewUrl: a.resolvedUrl,
    placementViewUrl: a.placementResolvedUrl,
  }));
  const reminders = remindersFor(card, today).filter((r) => r.tone !== 'info');

  return (
    <div className="space-y-4">
      <SheetNotes initial={notes} save={addFactoryJobNote.bind(null, id)} who="factory" />
      <MarkSeen orderId={id} hasNew={card.newChanges > 0} />

      <div>
        <Link href="/factory" className="text-xs font-semibold text-muted hover:text-ppc-gold">{T.backToJobs}</Link>
        <h1 className="mt-1 text-2xl font-bold">{view.teamName}</h1>
        <p className="text-sm text-muted">
          {view.invoiceNumber ? `Job ${view.invoiceNumber}` : 'No job number'}
          {view.sentToFactoryAt ? ` · sent ${formatLong(view.sentToFactoryAt)}` : ''}
          {' · '}
          {card.jerseys} jerseys
          {card.sockPairs > 0 ? ` · ${card.sockPairs} socks` : ''}
          {card.pantShells > 0 ? ` · ${card.pantShells} shells` : ''}
        </p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Right column first in the markup, so on a narrow screen the controls come before the long sheet. */}
        <aside className="space-y-4 xl:sticky xl:top-[76px] xl:order-2 xl:max-h-[calc(100dvh-92px)] xl:overflow-y-auto">
          <FactoryProgress orderId={id} state={card.state} neededBy={card.neededBy ? formatLong(card.neededBy) : null} />

          {reminders.length > 0 && (
            <section className="rounded-xl border border-line bg-surface p-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-ppc-gold">{T.todo}</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                {reminders.map((r, i) => (
                  <li key={i} className={r.tone === 'late' ? 'text-red-200' : ''}>• {r.text}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-xl border border-line bg-surface">
            <h2 className="border-b border-line px-3 py-2 text-sm font-bold uppercase tracking-wide text-ppc-gold">
              Changes from Powerplay
              {card.newChanges > 0 && <span className="ml-2 rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">{card.newChanges} new</span>}
            </h2>
            {card.changes.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">Nothing has changed since this job was sent.</p>
            ) : (
              <ul className="divide-y divide-line/50">
                {card.changes.slice(0, 30).map((c) => (
                  <li key={c.id} className={`px-3 py-2 text-sm ${c.isNew ? 'bg-red-500/[0.07]' : ''}`}>
                    <span className="flex items-baseline justify-between gap-2 text-[0.7rem] text-muted">
                      <span>{c.isNew ? <span className="font-bold text-red-300">NEW</span> : 'Seen'}</span>
                      <LocalTime iso={c.at} />
                    </span>
                    <span className="block">{c.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="px-1 text-xs text-muted">
            Something unclear? Press <span className="font-semibold text-ppc-gold">💬 Comment</span> (bottom right) and click the part
            of the sheet you mean. Powerplay is told right away.
          </p>
        </aside>

        <div className="min-w-0 xl:order-1">
          <FactorySheetBody view={view} assets={assets} csvHref={`/api/factory/jobs/${id}/roster.csv`} />
        </div>
      </div>
    </div>
  );
}
