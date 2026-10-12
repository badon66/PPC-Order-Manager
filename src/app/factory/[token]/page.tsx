import { notFound } from 'next/navigation';
import { repo } from '@/lib/data';
import { formatLong } from '@/lib/dates';
import { computeTotals } from '@/lib/order-utils';
import { STATUS_META } from '@/lib/constants';
import { resolveAll } from '@/lib/storage';
import { asDownload, downloadName } from '@/lib/download';
import { keepersOfSet } from '@/lib/keepers';
import { Field, Section } from '@/components/ui';
import {
  AddOnsSection, ArtworkSection, BuildTypeSection, ContactSection, KeeperBadge, NUMBER_ROLES,
  NotesSection, OrderTotalsSection, RosterSection,
} from '@/components/build-sheet';
import { lockFactory } from '../unlock/actions';

export const dynamic = 'force-dynamic';

/**
 * The factory's production sheet. Behind the factory code (src/proxy.ts), on
 * its own per-order token.
 *
 * Reads from `getByFactoryToken`, which builds the view field-by-field: the
 * same build sheet the customer signs off on, plus the factory-only notes and
 * the keeper jerseys, and never a price. Everything the factory needs to make
 * the job is on this one page, in the order it's needed: what's special about
 * this job first (notes, keepers, deadline), then the build, the roster, the
 * artwork, and where it ships.
 */
export default async function FactorySheet({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await repo.getByFactoryToken(token);
  if (!view) notFound();

  // Bucket keys, signed for an hour. Same as the customer's page.
  const assets = (await resolveAll(view.assets)).map((a) => ({
    ...a,
    viewUrl: a.resolvedUrl,
    placementViewUrl: a.placementResolvedUrl,
  }));
  const fonts = assets.filter((a) => a.role === 'font');
  const totals = computeTotals(view, view.roster);
  const keepers = view.keeperJerseys;
  const status = STATUS_META[view.status];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ppc-gold">Powerplay Customs · Production sheet</p>
          <h1 className="mt-1 text-2xl font-bold">{view.teamName}</h1>
          <p className="text-sm text-muted">
            {view.invoiceNumber ? `Job ${view.invoiceNumber} · ` : ''}
            {status.label}
            {view.sentToFactoryAt ? ` · sent ${formatLong(view.sentToFactoryAt)}` : ''}
          </p>
        </div>
        <form action={lockFactory}>
          <button type="submit" className="text-xs font-semibold text-muted hover:text-ppc-gold">
            Sign out
          </button>
        </form>
      </div>

      {/*
        * Roster still moving: the one thing that costs real money to get
        * wrong. Said up top, in amber, until the order reaches production.
        */}
      {!view.rosterLocked && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
          <p className="font-bold text-amber-200">Not released to production yet</p>
          <p className="mt-1 text-sm text-amber-100/80">
            Names, numbers and sizes on this sheet can still change until Powerplay moves the
            order into production. Don&apos;t cut from it before then.
          </p>
        </div>
      )}

      {/*
        * The factory's own notes, first and loudest. This is the box the whole
        * sheet exists for: the in-the-weeds instructions the team never sees.
        */}
      {view.factoryNotes && (
        <div className="rounded-xl border-2 border-ppc-gold bg-ppc-gold/10 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ppc-gold">Notes for the factory</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{view.factoryNotes}</p>
        </div>
      )}

      {/*
        * Keepers. Made on this run, NOT shipped with the team's order. The
        * instruction is repeated on the roster rows and in the totals so there
        * is no way to read the sheet and miss it.
        */}
      {keepers.length > 0 && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-400/10 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <KeeperBadge />
            <p className="text-lg font-bold text-amber-200">
              Make {keepers.length} extra jersey{keepers.length === 1 ? '' : 's'} for Powerplay and hold {keepers.length === 1 ? 'it' : 'them'} at the facility
            </p>
          </div>
          <p className="mt-2 text-sm text-amber-100/90">
            {keepers.length === 1 ? 'This jersey is' : 'These jerseys are'} for Powerplay Customs, not for the team.
            Make {keepers.length === 1 ? 'it' : 'them'} with the run, exactly like the set {keepers.length === 1 ? 'it copies' : 'they copy'},
            then set {keepers.length === 1 ? 'it' : 'them'} aside and keep {keepers.length === 1 ? 'it' : 'them'} at the facility.
            Do <span className="font-bold">not</span> pack {keepers.length === 1 ? 'it' : 'them'} in the team&apos;s box.
            Powerplay will say where {keepers.length === 1 ? 'it goes' : 'they go'}.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {view.sets.map((s, i) =>
              keepersOfSet(keepers, i).map((k) => (
                <div key={k.id} className="rounded-lg border border-amber-400/50 bg-surface p-3 text-sm">
                  <div className="text-xs font-bold uppercase tracking-wide text-amber-300">
                    {view.sets.length > 1 ? `Copy of the ${s.label}` : 'Copy of the jersey'}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    <span><span className="text-muted">Number</span> <span className="font-bold tabular-nums">{k.number || '—'}</span></span>
                    <span><span className="text-muted">Name</span> <span className="font-bold">{k.name.trim() || 'none'}</span></span>
                    <span><span className="text-muted">Size</span> <span className="font-bold">{k.size || '—'}</span></span>
                  </div>
                </div>
              )),
            )}
          </div>
        </div>
      )}

      <Section title="Job">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Team">{view.teamName}</Field>
          <Field label="Job / Invoice No.">{view.invoiceNumber}</Field>
          <Field label="Status">{status.label}</Field>
          {view.sentToFactoryAt && <Field label="Sent to factory">{formatLong(view.sentToFactoryAt)}</Field>}
          {view.productionStartDate && <Field label="Production start">{formatLong(view.productionStartDate)}</Field>}
          {view.productionFinishDate && <Field label="Production finished">{formatLong(view.productionFinishDate)}</Field>}
          <Field label="Estimated finish">{formatLong(view.estimatedFinishDate)}</Field>
          {view.isSample && <Field label="Sample order">Yes</Field>}
          {view.trackingCode && <Field label="Tracking">{view.trackingCode}</Field>}
          {view.approvedDate && <Field label="Proof signed off">{formatLong(view.approvedDate)}</Field>}
        </div>
        {view.deliveryConcern && (
          <div className="mt-4">
            <Field label="Needed by / delivery notes">{view.deliveryConcern}</Field>
          </div>
        )}
        {fonts.length > 0 && (
          <div className="mt-4 border-t border-line/60 pt-4">
            <p className="text-xs font-medium text-muted">{fonts.length === 1 ? 'Font' : 'Fonts'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {fonts.map((f) => (
                <a
                  key={f.id}
                  href={asDownload(f.viewUrl, downloadName([view.teamName, 'font'], f.fileName, f.viewUrl))}
                  download={downloadName([view.teamName, 'font'], f.fileName, f.viewUrl)}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3.5 py-2 text-sm font-semibold hover:border-ppc-gold/60 hover:text-ppc-gold"
                >
                  ↓ {f.displayName?.trim() || f.fileName || 'Download font'}
                </a>
              ))}
            </div>
          </div>
        )}
      </Section>

      <OrderTotalsSection sheet={view} totals={totals} keepers={keepers} />
      <BuildTypeSection sheet={view} assets={assets} />
      <AddOnsSection sheet={view} />
      <RosterSection sheet={view} csvHref={`/api/factory/${token}/roster.csv`} keepers={keepers} />
      <ArtworkSection sheet={view} assets={assets} hideRoles={[...NUMBER_ROLES, 'font', 'finished_photo']} />
      <NotesSection sheet={view} />

      <ContactSection
        sheet={view}
        title="Ship to"
        intro={
          <p className="mb-4 text-sm text-muted">
            The team&apos;s order ships here. Keeper jerseys do not — they stay at the facility for Powerplay.
          </p>
        }
      />

      <p className="text-xs text-muted">
        Questions about this job? Contact Keenan at Powerplay Customs. This sheet updates as the
        order does; reload it before cutting.
      </p>
    </div>
  );
}
