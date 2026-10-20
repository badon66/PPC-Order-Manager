import { repo } from '@/lib/data';
import { resolveAll } from '@/lib/storage';
import type { ClientLinkSections, ClientRosterSubmission, SubmittedContact, SubmittedPlayer } from '@/lib/types';
import { isNoName } from '@/lib/roster-edit';
import { contactOfOrder } from '@/lib/data/logic';

/**
 * Shared loader for the customer-facing pages under `/roster/[token]` — the
 * hub and the two stage pages (`/design`, `/details`). One token resolves to
 * one link and one previous submission; each page decides what to do with
 * them, but none of them should look this up its own way.
 *
 * Returns null when the token doesn't resolve to a live order, so every
 * caller can just `notFound()`.
 */

/** The section flag that decides whether a submission is a source for a given prefill field. */
type SectionOf = keyof ClientLinkSections;

export async function loadClientPage(token: string) {
  const link = await repo.getByRosterToken(token);
  if (!link) return null;

  /*
   * A stage page only ever submits its own sections — a `/details` visit
   * carries no logos or inspiration, and a `/design` visit carries no roster
   * or contact (see the same note in `diffSubmissions`, data/logic.ts). Pre-
   * filling from the single newest submission meant a visit to one stage
   * blanked out whatever was sent on the other: after a `/details` submission
   * the `/design` page showed no logos or colours at all, even though a team
   * had sent them earlier.
   *
   * So each field is pulled from the newest submission that actually asked
   * for its section, not from "the newest submission" overall. `revision` and
   * `submittedAt` still come from the newest submission of any kind, since
   * those describe the customer's most recent visit, not any one field.
   */
  const bundle = await repo.getOrder(link.orderId);
  const submissions = [...(bundle?.submissions ?? [])]
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const newestWith = (section: SectionOf): ClientRosterSubmission | undefined =>
    submissions.find((s) => s.sections[section]);

  const newest = submissions[0] ?? null;
  const logoSrc = newestWith('logos');
  const inspirationSrc = newestWith('inspiration');
  const rosterSrc = newestWith('roster');
  const contactSrc = newestWith('personalDetails');

  /*
   * What a team sends becomes the roster (its own Roster N, once Keenan
   * accepts it), so the form has to start from what's really there — or a
   * team adding "the one missing player" would send a roster of one.
   *
   * Their own submission, while Keenan hasn't accepted it yet: they're still
   * revising it. Otherwise the roster in use, which is the truth now (it may
   * have been imported or edited since they last sent anything).
   */
  const pendingRoster = rosterSrc && !rosterSrc.acceptedAt ? rosterSrc : undefined;
  const currentRoster: SubmittedPlayer[] = pendingRoster
    ? []
    : (bundle?.roster ?? []).map((r) => ({
        playerNameAsPrinted: isNoName(r, bundle!.order.nameStyle) ? '' : r.playerNameAsPrinted,
        number: r.number,
        isGoalie: r.isGoalie,
        captaincy: r.captaincy,
        sockOnly: r.sockOnly,
        jerseySize: r.jerseySize,
        sockSize: r.sockSize,
        pantShellSize: r.pantShellSize,
        notes: r.notes,
      }));

  /*
   * What the details step starts from — same rule as the roster above. Their
   * own contact details while Keenan hasn't accepted them yet (still being
   * revised); otherwise what's on the order, which is the truth now (Keenan
   * may have typed it from an email, or corrected it). A team that has never
   * used the form still sees the address we have, so "check your shipping
   * details" has something to check.
   */
  const pendingContact = contactSrc && !contactSrc.acceptedAt ? contactSrc.contact : undefined;
  const orderContact = bundle ? contactOfOrder(bundle.order) : undefined;
  const contactOnFile: SubmittedContact | undefined =
    pendingContact ??
    (orderContact && Object.values(orderContact).some((v) => v.trim()) ? orderContact : undefined) ??
    contactSrc?.contact;

  const previous = newest
    ? {
        revision: newest.revision,
        submittedAt: newest.submittedAt,
        // Only a submission still being revised pre-fills the rows; once it's
        // accepted, the roster in use (currentRoster) is what they start from.
        players: pendingRoster?.players ?? [],
        rosterAnswer: currentRoster.length ? 'typed' as const : rosterSrc?.rosterAnswer,
        rosterFiles: currentRoster.length ? [] : rosterSrc?.rosterFiles ?? [],
        convertedFrom: pendingRoster?.convertedFrom ?? null,
        extras: rosterSrc?.extras ?? [],
        logos: logoSrc?.logos ?? [],
        inspiration: inspirationSrc?.inspiration ?? [],
        colours: inspirationSrc?.colours ?? '',
        contact: contactSrc?.contact,
      }
    : null;

  // Their previous uploads are keys in a private bucket. Sign them so a
  // revisit shows the files they already sent, not broken thumbnails — every
  // file prefilled above, from whichever submission it came from.
  const previousPreviews = Object.fromEntries(
    (
      await resolveAll([
        ...(previous?.logos ?? []).map((l) => ({ fileUrl: l.fileUrl })),
        ...(previous?.inspiration ?? []).map((i) => ({ fileUrl: i.fileUrl })),
        ...(previous?.rosterFiles ?? []).map((f) => ({ fileUrl: f.fileUrl })),
        ...(previous?.convertedFrom ? [{ fileUrl: previous.convertedFrom.fileUrl }] : []),
      ])
    ).map((f) => [f.fileUrl, f.resolvedUrl]),
  );

  return { link, previous, previousPreviews, currentRoster, contactOnFile };
}
