import { notFound } from 'next/navigation';
import { repo } from '@/lib/data';
import { formatLong } from '@/lib/dates';
import { computeTotals } from '@/lib/order-utils';
import { Field, Section } from '@/components/ui';
import {
  AddOnsSection, ArtworkSection, BuildTypeSection, ContactSection, NotesSection,
  OrderTotalsSection, RosterSection,
} from '@/components/build-sheet';
import { ApproveBlock } from './approve';
import { SignatureProof } from '@/components/signature-proof';
import { CLIENT_LINK_SECTION_META } from '@/lib/types';
import type { ClientLinkSections } from '@/lib/types';
import { Timeline } from '@/components/timeline';
import { stageMessage } from '@/lib/data/timeline';
import { clientEditingLocked } from '@/lib/data/logic';
import { upsTrackingUrl } from '@/lib/data/update-mail';
import { resolveAll } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Customer-facing. No login.
 *
 * Reached through an unguessable per-order token, not the row id — a leaked
 * link should not also be a database key, and the token can be rotated.
 *
 * getByShareToken() builds this view field-by-field rather than spreading the
 * order, so contact details and the shipping address cannot leak here by
 * accident when someone adds a field later.
 */

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await repo.getByShareToken(token);
  if (!view) notFound();

  /*
   * Artwork is stored as a bucket key, not a URL, so it has to be signed before
   * a browser can load it. `publicViewOf` has already dropped the font file —
   * a licensed typeface is not something the customer ordered.
   *
   * The signed links last an hour. A customer who leaves this page open all
   * afternoon and reloads gets fresh ones; a link forwarded around next week is
   * dead, which is the point.
   */
  const assets = (await resolveAll(view.assets)).map((a) => ({
    ...a,
    viewUrl: a.resolvedUrl,
    placementViewUrl: a.placementResolvedUrl,
  }));

  /*
   * The same calculation the admin page runs, not a second copy of it.
   *
   * This page used to count roster rows directly, which reads as zero on an
   * order whose roster hasn't been filled in yet — even though the quantities
   * were entered. computeTotals already falls back to those quantities; the
   * bug was only that this page wasn't asking it.
   */
  const totals = computeTotals(view, view.roster);

  const signOffOpen = view.requestApproval && !view.approvedBy && !view.approvedDate;
  const stage = stageMessage(view.status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ppc-gold">{view.teamName}</h1>
          <p className="text-sm text-muted">Shared Order Details</p>
        </div>
      </div>

      {/*
        * Ready for sign-off: say so first thing. The signature lives at the
        * bottom on purpose — the customer should read the sheet on the way
        * down — so the top of the page says what's being asked and jumps there.
        */}
      {signOffOpen && (
        <div className="rounded-xl border-2 border-ppc-gold bg-ppc-gold/10 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ppc-gold">Ready for your sign-off</p>
          <p className="mt-2 text-lg font-bold">Check every line, then approve at the bottom.</p>
          <p className="mt-1 text-sm text-muted">
            This sheet is exactly what our factory sees: the names, numbers and sizes on it are what
            gets printed. Once it&apos;s approved nothing changes, so look twice.
          </p>
          <a
            href="#sign-off"
            className="mt-4 inline-block rounded-lg bg-ppc-gold px-5 py-2.5 text-sm font-bold text-black hover:opacity-90"
          >
            Go to sign-off ↓
          </a>
        </div>
      )}

      {/*
        * From production on the only thing the form can still want is the
        * contact and shipping details, and the box only shows while the order
        * is missing them (clientFormReminder) — so it says exactly that.
        */}
      {view.clientFormOpen && clientEditingLocked(view.status) && (
        <div className="rounded-xl border-2 border-ppc-gold bg-ppc-gold/10 p-4">
          <p className="font-bold text-ppc-gold">We still need your shipping details</p>
          <p className="mt-1 text-sm text-muted">
            The jerseys can&apos;t ship until we know who to contact and where they&apos;re going.
            Use the form link we sent you to fill in your contact and shipping details. Can&apos;t
            find the link? Just reply to our email and we&apos;ll resend it.
          </p>
        </div>
      )}

      {view.clientFormOpen && !clientEditingLocked(view.status) && (
        <div className="rounded-xl border-2 border-ppc-gold bg-ppc-gold/10 p-4">
          <p className="font-bold text-ppc-gold">We still need a few things from you</p>
          <p className="mt-1 text-sm text-muted">
            Your team&apos;s form is open for:{' '}
            <span className="font-semibold text-foreground">
              {(Object.keys(CLIENT_LINK_SECTION_META) as (keyof ClientLinkSections)[])
                .filter((k) => view.clientFormSections[k])
                .map((k) => CLIENT_LINK_SECTION_META[k].label)
                .join(', ') || 'details'}
            </span>
            . Use the form link we sent you to fill it in. Nothing goes into production until
            it&apos;s done, so the sooner the better. Can&apos;t find the link? Just reply to our
            email and we&apos;ll resend it.
          </p>
        </div>
      )}

      <Section title="Where your order is">
        <Timeline steps={view.timeline} />
        {/*
          * From production on, this page is where every email points: say
          * where things stand right under the timeline, then every detail of
          * the order below it.
          */}
        {stage && (
          <div className="mt-4 rounded-xl border border-ppc-gold/40 bg-ppc-gold/5 p-4">
            <p className="font-semibold text-ppc-gold">{stage.title}</p>
            <p className="mt-1 text-sm text-muted">{stage.text}</p>
          </div>
        )}
      </Section>

      <Section title="Order Information">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Team Name">{view.teamName}</Field>
          <Field label="Invoice Number">{view.invoiceNumber}</Field>
          <Field label="Date Paid">{formatLong(view.datePaid)}</Field>
          <Field label="Estimated Finish">{formatLong(view.estimatedFinishDate)}</Field>
          {view.productionStartDate && (
            <Field label="Production Start">{formatLong(view.productionStartDate)}</Field>
          )}
          {view.productionFinishDate && (
            <Field label="Production Finished">{formatLong(view.productionFinishDate)}</Field>
          )}
          {view.isSample && <Field label="Sample Order">Yes</Field>}
          {view.trackingCode && (
            <Field label="UPS Tracking">
              <a
                href={upsTrackingUrl(view.trackingCode)}
                target="_blank"
                rel="noreferrer"
                className="text-ppc-gold hover:underline"
              >
                {view.trackingCode} →
              </a>
            </Field>
          )}
          {view.googleDriveLink && (
            <Field label="Google Drive">
              <a
                href={view.googleDriveLink}
                target="_blank"
                rel="noreferrer"
                className="text-ppc-gold hover:underline"
              >
                View Files →
              </a>
            </Field>
          )}
        </div>
        {view.deliveryConcern && (
          <div className="mt-4">
            <Field label="Needed By / Delivery Notes">{view.deliveryConcern}</Field>
          </div>
        )}
        <p className="mt-4 text-xs text-muted">
          Finish dates are estimates. Shipping can be affected by customs and carriers, especially
          on cross-border orders.
        </p>
      </Section>

      <ContactSection
        sheet={view}
        title="Shipping & Contact — please check this"
        intro={
          <p className="mb-4 text-sm text-muted">
            This is where the order ships and who we&apos;ll contact. If anything here is wrong,
            tell us before the order ships — we can&apos;t reroute it once it&apos;s on its way.
          </p>
        }
      />

      {/*
        * The build itself — totals, build type, add-ons, roster, artwork,
        * notes — is the same set of sections the factory's sheet renders,
        * read from the same view. See components/build-sheet.tsx.
        */}
      <OrderTotalsSection sheet={view} totals={totals} />
      <BuildTypeSection sheet={view} assets={assets} />
      <AddOnsSection sheet={view} assets={assets} />
      <RosterSection sheet={view} csvHref={`/api/share/${token}/roster.csv`} />
      <ArtworkSection sheet={view} assets={assets} />
      <NotesSection sheet={view} />

      {/*
        * Three states: already signed, open for signing, or neither.
        *
        * "Neither" renders nothing at all — an order that isn't ready to be
        * approved shouldn't show an approval section explaining that it can't
        * be approved yet. Keenan turns it on when the proof is ready.
        */}
      {view.approvedBy || view.approvedDate ? (
        <Section title="Approval">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Approved By">{view.approvedBy}</Field>
            <Field label="Approval Date">{formatLong(view.approvedDate)}</Field>
          </div>
          {view.approvalRecord && <SignatureProof record={view.approvalRecord} />}
          <p className="mt-4 text-xs text-muted">
            Once a proof is approved the order is locked and final — no changes or cancellations
            after this point.
          </p>
        </Section>
      ) : signOffOpen ? (
        <div id="sign-off" className="scroll-mt-4 rounded-xl ring-2 ring-ppc-gold">
          <Section title="Sign off on your order">
            <ApproveBlock token={token} teamName={view.teamName} rosterCount={view.roster.length} />
          </Section>
        </div>
      ) : null}
    </div>
  );
}
