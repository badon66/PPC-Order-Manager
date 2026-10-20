'use server';

import { repo } from '@/lib/data';
import { isClientLockedError, pageAsks, submittableSections } from '@/lib/data/logic';
import { cleanSubmission, type SubmitPayload } from '@/lib/data/submission-logic';
import { STAGE_SECTIONS, type StagePage } from '@/lib/data/stage-pages';

/**
 * The customer's submit. No session — the roster token is what authorises it,
 * and it has to resolve to a live order with the link switched on.
 *
 * What is kept of the payload is decided in `cleanSubmission`: only the
 * sections the link asks for, and the roster in the shape the team said they
 * were sending it (typed rows, an uploaded list, or nothing yet).
 *
 * A stage page (`/design`, `/details`) submits its own fixed section set
 * rather than whatever the hub link is configured for — a customer sent
 * straight to the design page still only sees, and only sends, logos and
 * inspiration, whatever else the order's own link asks for.
 *
 * Which of those sections are still open is `submittableSections`: from
 * production on only the contact and shipping details, until the order
 * ships. A form opened before production that still shows the roster is
 * refused, not trimmed.
 */

export type { SubmitPayload } from '@/lib/data/submission-logic';

export type SubmitResult = { ok: true } | { ok: false; error: string };

export async function submitClientForm(
  token: string,
  payload: SubmitPayload,
  stage?: StagePage,
): Promise<SubmitResult> {
  const link = await repo.getByRosterToken(token);
  if (!link || !link.enabled) return { ok: false, error: 'This link is no longer active.' };
  // Checked again in the store, at the write. Here so the customer gets the
  // real reason rather than a generic failure.
  const allowed = submittableSections(
    pageAsks(link.sections, link.status, stage ? STAGE_SECTIONS[stage] : undefined),
    link.status,
    payload.sectionsShown,
  );
  if (!allowed.ok) return allowed;

  const cleaned = cleanSubmission(
    {
      sections: allowed.sections,
      includesSocks: link.includesSocks,
      includesPantShells: link.includesPantShells,
      extraJerseys: link.extraJerseys,
    },
    payload,
  );
  if (!cleaned.ok) return cleaned;

  try {
    await repo.submitClientRoster(token, cleaned.value);
  } catch (e) {
    // The store's own check, for a status that changed between the check
    // above and the write. Its message is written for the customer; anything
    // else is a real failure and stays one.
    if (isClientLockedError(e)) return { ok: false, error: e.message };
    throw e;
  }

  return { ok: true };
}
