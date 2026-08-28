import { notFound } from 'next/navigation';
import { repo } from '@/lib/data';
import { resolveAll } from '@/lib/storage';
import { CLIENT_LINK_SECTION_META, type ClientLinkSections } from '@/lib/types';
import { ClientForm } from './client-form';
import { ApproveBlock } from '@/app/share/[token]/approve';
import { formatLong } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/**
 * Customer-facing. No login — the token in the URL is the credential.
 *
 * Renders only the sections Keenan ticked in the order form. If he's switched
 * the link off, the customer sees a polite dead end rather than a form that
 * silently discards what they type.
 */
export default async function ClientRosterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await repo.getByRosterToken(token);
  if (!link) notFound();

  // Their own previous submission, so a revisit is an edit rather than a
  // blank form they'd have to re-type from scratch.
  const previous = await repo.getLatestSubmissionByRosterToken(token);

  // Their previous uploads are keys in a private bucket. Sign them so a
  // revisit shows the files they already sent, not broken thumbnails.
  const previousPreviews = Object.fromEntries(
    (
      await resolveAll([
        ...(previous?.logos ?? []).map((l) => ({ fileUrl: l.fileUrl })),
        ...(previous?.inspiration ?? []).map((i) => ({ fileUrl: i.fileUrl })),
      ])
    ).map((f) => [f.fileUrl, f.resolvedUrl]),
  );

  const keys = Object.keys(CLIENT_LINK_SECTION_META) as Array<keyof ClientLinkSections>;
  const asked = keys.filter((k) => link.sections[k]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">Powerplay Customs</p>
        <h1 className="mt-1 text-2xl font-bold text-ppc-gold">{link.teamName || 'Your order'}</h1>
        {link.enabled && asked.length > 0 && !link.locked ? (
          previous ? (
            <p className="mt-2 text-sm text-muted">
              You&apos;ve sent this to us once already — everything you entered is below. Change
              anything that needs changing and send it again, right up until your order goes
              into production. We&apos;ll see exactly what you updated.
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">
              We need a few things from you to get this order moving:{' '}
              {asked.map((k) => CLIENT_LINK_SECTION_META[k].label.toLowerCase()).join(', ')}.
              Fill in what you can — takes a few minutes.
            </p>
          )
        ) : null}
      </div>

      {/*
        * Three states, deliberately distinct.
        *
        * "In production" is not the same message as "this link is switched
        * off" — one means you're too late, the other means it was never open —
        * and a customer who gets the wrong one either waits for a reply that
        * isn't coming or phones about a problem that doesn't exist.
        */}
      {link.locked ? (
        <div className="rounded-xl border border-ppc-gold/40 bg-ppc-gold/5 p-6 text-center">
          <p className="font-semibold text-ppc-gold">Your order is being made.</p>
          <p className="mt-2 text-sm text-muted">
            Because it&apos;s already in production, this form is now closed and everything you
            sent is locked in. If something needs changing, get in touch with us directly and
            we&apos;ll tell you straight away what&apos;s still possible.
          </p>
          {previous && (
            <p className="mt-3 text-xs text-muted">
              We have revision {previous.revision} of your details on file.
            </p>
          )}
        </div>
      ) : !link.enabled || asked.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-6 text-center">
          <p className="font-semibold">This link isn&apos;t collecting anything right now.</p>
          <p className="mt-1 text-sm text-muted">
            If you were expecting to submit something, get in touch with Powerplay Customs and
            we&apos;ll sort it out.
          </p>
        </div>
      ) : (
        <ClientForm
          token={token}
          teamName={link.teamName}
          sections={link.sections}
          existingRosterCount={link.existingRosterCount}
          includesSocks={link.includesSocks}
          includesPantShells={link.includesPantShells}
          jerseyCount={link.jerseyCount}
          extraJerseys={link.extraJerseys}
          extraJerseyDetails={link.extraJerseyDetails}
          previousPreviews={previousPreviews}
          previous={
            previous
              ? {
                  revision: previous.revision,
                  players: previous.players,
                  logos: previous.logos,
                  inspiration: previous.inspiration ?? [],
                  contact: previous.contact,
                  submittedAt: previous.submittedAt,
                }
              : null
          }
        />
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
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-center">
            <p className="font-semibold text-emerald-200">This order is approved.</p>
            <p className="mt-1 text-sm text-muted">
              Signed off by {link.approvedBy || 'your team'}
              {link.approvedDate ? ` on ${formatLong(link.approvedDate)}` : ''}.
            </p>
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
            <ApproveBlock token={token} teamName={link.teamName} />
          </div>
        )
      )}
    </div>
  );
}
