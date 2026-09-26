import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClientForm } from '../client-form';
import { loadClientPage } from '../load';
import { STAGE_PAGE_COPY, STAGE_SECTIONS } from '@/lib/data/stage-pages';

export const dynamic = 'force-dynamic';

const STAGE = 'details' as const;

/**
 * Customer-facing, same token as the hub. A dedicated entry point for the
 * details stage — roster and contact only — so an email pointing at "send us
 * your roster" doesn't land a customer on a page also asking for logos they
 * already sent, or haven't touched.
 *
 * No login — the token in the URL is the credential, same as the hub.
 */
export default async function DetailsStagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await loadClientPage(token);
  if (!data) notFound();
  const { link, previous, previousPreviews } = data;
  const copy = STAGE_PAGE_COPY[STAGE];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">Powerplay Customs</p>
        <h1 className="mt-1 text-2xl font-bold text-ppc-gold">{copy.title}</h1>
        <p className="mt-2 text-sm text-muted">{copy.intro}</p>
        <Link href={`/roster/${token}`} className="mt-3 inline-block text-xs font-semibold text-muted hover:text-ppc-gold">
          ← Your team&apos;s page
        </Link>
      </div>

      {/* Same three states as the hub — locked / not collecting / the form. */}
      {link.locked ? (
        <div className="rounded-xl border border-ppc-gold/40 bg-ppc-gold/5 p-6 text-center">
          <p className="font-semibold text-ppc-gold">Your order is being made.</p>
          <p className="mt-2 text-sm text-muted">
            Everything you sent is locked in. If something needs changing, reply to any of our
            emails and we&apos;ll tell you straight away what&apos;s still possible.
          </p>
        </div>
      ) : !link.enabled ? (
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
          sections={STAGE_SECTIONS[STAGE]}
          stage={STAGE}
          variant={link.variant}
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
                  rosterAnswer: previous.rosterAnswer,
                  rosterFiles: previous.rosterFiles ?? [],
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
      )}
    </div>
  );
}
