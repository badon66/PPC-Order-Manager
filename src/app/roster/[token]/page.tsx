import { notFound } from 'next/navigation';
import { CLIENT_LINK_SECTION_META, type ClientLinkSections } from '@/lib/types';
import { ClientForm } from './client-form';
import { ROUTE_COPY } from '@/lib/route-copy';
import { ApproveBlock } from '@/app/share/[token]/approve';
import { SignatureProof } from '@/components/signature-proof';
import { Timeline } from '@/components/timeline';
import { formatLong } from '@/lib/dates';
import { loadClientPage } from './load';
import { detailsStillOpenMessage, stageMessage } from '@/lib/data/timeline';
import { contactComplete } from '@/lib/data/logic';

export const dynamic = 'force-dynamic';

/**
 * Customer-facing. No login — the token in the URL is the credential.
 *
 * Renders only the sections Keenan ticked in the order form that are still
 * open (`link.open`): from production on that's at most the contact and
 * shipping details, which stay open until the order ships. If he's switched
 * the link off, the customer sees a polite dead end rather than a form that
 * silently discards what they type.
 */
export default async function ClientRosterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await loadClientPage(token);
  if (!data) notFound();
  const { link, previous, previousPreviews, currentRoster, contactOnFile } = data;

  const keys = Object.keys(CLIENT_LINK_SECTION_META) as Array<keyof ClientLinkSections>;
  // What the form still takes. Before production, everything Keenan ticked.
  const open = keys.filter((k) => link.open[k]);
  // From production on: the jerseys are being made (or done), and the
  // contact and shipping details are what's left. Say that, not "locked in".
  const stillOpen = link.locked && open.length > 0 ? detailsStillOpenMessage(link.status, contactComplete(contactOnFile)) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">Powerplay Customs</p>
        <h1 className="mt-1 text-2xl font-bold text-ppc-gold">{link.teamName || 'Your order'}</h1>
        {stillOpen ? (
          <>
            <p className="mt-2 text-base font-semibold text-fg">{stillOpen.title}</p>
            <p className="mt-1 text-sm text-muted">{stillOpen.text}</p>
          </>
        ) : open.length > 0 ? (
          previous ? (
            <p className="mt-2 text-sm text-muted">
              You&apos;ve sent this to us once already — everything you entered is below. Change
              anything that needs changing and send it again, right up until your order goes
              into production. We&apos;ll see exactly what you updated.
            </p>
          ) : link.variant ? (
            <>
              <p className="mt-2 text-base font-semibold text-fg">{ROUTE_COPY[link.variant].title}</p>
              <p className="mt-1 text-sm text-muted">{ROUTE_COPY[link.variant].intro}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              We need a few things from you to get this order moving:{' '}
              {open.map((k) => CLIENT_LINK_SECTION_META[k].label.toLowerCase()).join(', ')}.
              Fill in what you can — takes a few minutes.
            </p>
          )
        ) : null}
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-muted">Where your order is</p>
        <Timeline steps={link.timeline} />
      </div>

      {/*
        * Three states, deliberately distinct.
        *
        * "In production" is not the same message as "this link is switched
        * off" — one means you're too late, the other means it was never open —
        * and a customer who gets the wrong one either waits for a reply that
        * isn't coming or phones about a problem that doesn't exist.
        *
        * The form comes first: anything still open means the form, even after
        * production (the address), and "locked in" only when nothing is.
        */}
      {open.length > 0 ? (
        <ClientForm
          token={token}
          teamName={link.teamName}
          sections={link.open}
          variant={link.variant}
          existingRosterCount={link.existingRosterCount}
          includesSocks={link.includesSocks}
          includesPantShells={link.includesPantShells}
          jerseyCount={link.jerseyCount}
          extraJerseys={link.extraJerseys}
          extraJerseyDetails={link.extraJerseyDetails}
          previousPreviews={previousPreviews}
          currentRoster={currentRoster}
          contactOnFile={contactOnFile}
          previous={
            previous
              ? {
                  revision: previous.revision,
                  players: previous.players,
                  rosterAnswer: previous.rosterAnswer,
                  rosterFiles: previous.rosterFiles ?? [],
                  convertedFrom: previous.convertedFrom,
                  extras: previous.extras,
                  logos: previous.logos,
                  inspiration: previous.inspiration ?? [],
                  colours: previous.colours,
                  contact: previous.contact,
                  submittedAt: previous.submittedAt,
                }
              : null
          }
        />
      ) : link.locked ? (
        <div className="rounded-xl border border-ppc-gold/40 bg-ppc-gold/5 p-6 text-center">
          <p className="font-semibold text-ppc-gold">{stageMessage(link.status)?.title ?? 'Your order is being made.'}</p>
          <p className="mt-2 text-sm text-muted">
            Everything you sent is locked in. The timeline above shows where it is; if something
            needs changing, reply to any of our emails and we&apos;ll tell you straight away
            what&apos;s still possible.
          </p>
          {previous && (
            <p className="mt-3 text-xs text-muted">
              We have revision {previous.revision} of your details on file.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-6 text-center">
          <p className="font-semibold">This link isn&apos;t collecting anything right now.</p>
          <p className="mt-1 text-sm text-muted">
            If you were expecting to submit something, get in touch with Powerplay Customs and
            we&apos;ll sort it out.
          </p>
        </div>
      )}

      {/*
        * The same sign-off as the share page, on the form link too.
        *
        * Teams often only ever get sent one of the two links, and which one is
        * not something anybody tracks. Without this, a team sent the roster
        * form had no way to approve at all.
        */}
      {link.requestApproval && !link.locked && (
        link.approvedBy || link.approvedDate ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5">
            <p className="text-center font-semibold text-emerald-200">This order is approved.</p>
            <p className="mt-1 text-center text-sm text-muted">
              Signed off by {link.approvedBy || 'your team'}
              {link.approvedDate ? ` on ${formatLong(link.approvedDate)}` : ''}.
            </p>
            {link.approvalRecord && <SignatureProof record={link.approvalRecord} />}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Before you approve, have a look over the full order —{' '}
              <a
                href={`/share/${link.shareToken}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-ppc-gold hover:underline"
              >
                open your order summary
              </a>{' '}
              to check the design, sizes and shipping address.
            </p>
            <ApproveBlock
              token={token}
              teamName={link.teamName}
              rosterCount={link.existingRosterCount}
              // The roster they're signing is the one on the order, not this form.
              rosterHref={`/share/${link.shareToken}#roster`}
            />
          </div>
        )
      )}
    </div>
  );
}
