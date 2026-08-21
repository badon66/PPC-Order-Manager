import { notFound } from 'next/navigation';
import { repo } from '@/lib/data';
import { CLIENT_LINK_SECTION_META, type ClientLinkSections } from '@/lib/types';
import { ClientForm } from './client-form';

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

  const keys = Object.keys(CLIENT_LINK_SECTION_META) as Array<keyof ClientLinkSections>;
  const asked = keys.filter((k) => link.sections[k]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">Powerplay Customs</p>
        <h1 className="mt-1 text-2xl font-bold text-ppc-gold">{link.teamName || 'Your order'}</h1>
        {link.enabled && asked.length > 0 ? (
          previous ? (
            <p className="mt-2 text-sm text-muted">
              You&apos;ve sent this to us once already — everything you entered is below. Change
              anything that needs changing and send it again. We&apos;ll see exactly what you
              updated.
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

      {!link.enabled || asked.length === 0 ? (
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
    </div>
  );
}
