'use server';

import { repo } from '@/lib/data';
import { CLIENT_LOCKED_MESSAGE } from '@/lib/data/logic';
import { cleanSubmission, type SubmitPayload } from '@/lib/data/submission-logic';

/**
 * The customer's submit. No session — the roster token is what authorises it,
 * and it has to resolve to a live order with the link switched on.
 *
 * What is kept of the payload is decided in `cleanSubmission`: only the
 * sections the link asks for, and the roster in the shape the team said they
 * were sending it (typed rows, an uploaded list, or nothing yet).
 */

export type { SubmitPayload } from '@/lib/data/submission-logic';

export type SubmitResult = { ok: true } | { ok: false; error: string };

export async function submitClientForm(token: string, payload: SubmitPayload): Promise<SubmitResult> {
  const link = await repo.getByRosterToken(token);
  if (!link || !link.enabled) return { ok: false, error: 'This link is no longer active.' };
  // Checked again in the store, at the write. Here so the customer gets the
  // real reason rather than a generic failure.
  if (link.locked) return { ok: false, error: CLIENT_LOCKED_MESSAGE };

  const cleaned = cleanSubmission(
    {
      sections: link.sections,
      includesSocks: link.includesSocks,
      includesPantShells: link.includesPantShells,
      extraJerseys: link.extraJerseys,
    },
    payload,
  );
  if (!cleaned.ok) return cleaned;

  await repo.submitClientRoster(token, cleaned.value);

  return { ok: true };
}
