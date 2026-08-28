'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { repo } from '@/lib/data';
import { APPROVAL_STATEMENT, TERMS_URL } from '@/lib/constants';
import { today } from '@/lib/dates';
import type { ApprovalRecord } from '@/lib/types';

/**
 * Record a customer's sign-off.
 *
 * No session — the share token is the credential, same as every other public
 * page here. What that buys is limited and worth being honest about: it proves
 * whoever approved had the link, not who they are. The typed name and the
 * captured origin are there so a disagreement later has something to look at,
 * not because they constitute identity.
 *
 * Everything the browser checked is checked again here. A disabled button is a
 * courtesy to the person; it is not a control.
 */
export async function approveOrder(
  token: string,
  input: { signedName: string; termsAccepted: boolean },
): Promise<{ ok: boolean; error?: string }> {
  /*
   * Either public token can sign.
   *
   * A team that was only ever sent the roster form link would otherwise have
   * no way to approve — and "which link did I send them" is not a thing worth
   * remembering. Both tokens are equally unguessable and equally per-order, so
   * accepting both costs nothing and removes a dead end.
   */
  const view =
    (await repo.getByShareToken(token)) ??
    (await (async () => {
      const link = await repo.getByRosterToken(token);
      return link ? await repo.getByShareToken(link.shareToken) : null;
    })());

  if (!view) return { ok: false, error: 'This link is no longer active.' };

  if (!view.requestApproval) {
    return { ok: false, error: 'This order is not open for approval right now.' };
  }

  /*
   * Approving twice is refused rather than overwritten.
   *
   * The first signature is the one that was given against what was on screen
   * at the time. A second one, taken after an edit, would silently replace the
   * record of the first — which is the one moment this whole feature exists to
   * preserve.
   */
  if (view.approvedDate || view.approvalRecord) {
    return { ok: false, error: 'This order has already been approved.' };
  }

  if (!input.termsAccepted) {
    return { ok: false, error: 'Please accept the terms and conditions first.' };
  }

  const signedName = input.signedName.trim().slice(0, 120);
  if (signedName.length < 2) {
    return { ok: false, error: 'Please type your name to sign.' };
  }

  const h = await headers();
  const record: ApprovalRecord = {
    signedName,
    signedAt: new Date().toISOString(),
    termsAccepted: true,
    termsUrl: TERMS_URL,
    // Copied in, not referenced: if the wording is ever changed, this approval
    // still says what it was signed against.
    statement: APPROVAL_STATEMENT,
    ipAddress: (h.get('x-forwarded-for') ?? '').split(',')[0].trim(),
    userAgent: (h.get('user-agent') ?? '').slice(0, 300),
  };

  await repo.updateOrder(
    view.orderId,
    {
      approvedBy: signedName,
      // A calendar date for display, alongside the exact instant on the record.
      approvedDate: today(),
      approvalRecord: record,
    },
    { email: 'client', name: signedName || view.teamName || 'Client' },
  );

  revalidatePath(`/share/${token}`);
  revalidatePath(`/roster/${token}`);
  revalidatePath(`/orders/${view.orderId}`);
  return { ok: true };
}
