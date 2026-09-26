import { repo } from '@/lib/data';
import { resolveAll } from '@/lib/storage';

/**
 * Shared loader for the customer-facing pages under `/roster/[token]` — the
 * hub and the two stage pages (`/design`, `/details`). One token resolves to
 * one link and one previous submission; each page decides what to do with
 * them, but none of them should look this up its own way.
 *
 * Returns null when the token doesn't resolve to a live order, so every
 * caller can just `notFound()`.
 */
export async function loadClientPage(token: string) {
  const link = await repo.getByRosterToken(token);
  if (!link) return null;

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
        ...(previous?.rosterFiles ?? []).map((f) => ({ fileUrl: f.fileUrl })),
      ])
    ).map((f) => [f.fileUrl, f.resolvedUrl]),
  );

  return { link, previous, previousPreviews };
}
