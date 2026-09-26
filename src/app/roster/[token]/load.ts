import { repo } from '@/lib/data';
import { resolveAll } from '@/lib/storage';
import type { ClientLinkSections, ClientRosterSubmission } from '@/lib/types';

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
  const submissions = [...((await repo.getOrder(link.orderId))?.submissions ?? [])]
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const newestWith = (section: SectionOf): ClientRosterSubmission | undefined =>
    submissions.find((s) => s.sections[section]);

  const newest = submissions[0] ?? null;
  const logoSrc = newestWith('logos');
  const inspirationSrc = newestWith('inspiration');
  const rosterSrc = newestWith('roster');
  const contactSrc = newestWith('personalDetails');

  const previous = newest
    ? {
        revision: newest.revision,
        submittedAt: newest.submittedAt,
        players: rosterSrc?.players ?? [],
        rosterAnswer: rosterSrc?.rosterAnswer,
        rosterFiles: rosterSrc?.rosterFiles ?? [],
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
      ])
    ).map((f) => [f.fileUrl, f.resolvedUrl]),
  );

  return { link, previous, previousPreviews };
}
