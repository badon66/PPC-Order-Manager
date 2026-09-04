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
/**
 * A drawn signature, as a PNG data URL, capped.
 *
 * The cap is abuse defence, not a quality bar: this string is stored on the
 * order row, and that row is read whole whenever the orders list loads. The
 * pad downscales before it exports, so a real signature lands far below this.
 */
const SIGNATURE_PREFIX = 'data:image/png;base64,';
const SIGNATURE_MAX_CHARS = 250_000;

export async function approveOrder(
  token: string,
  input: { signedName: string; termsAccepted: boolean; signatureDataUrl: string },
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
    return { ok: false, error: 'Please print your name under the signature.' };
  }

  /*
   * The drawn mark is required, not optional.
   *
   * This is the whole point of the change: a typed name is something anybody
   * can produce for anybody. Checked here as well as in the browser, because
   * the browser is not where the rule lives.
   */
  const signatureDataUrl = input.signatureDataUrl ?? '';
  if (!signatureDataUrl.startsWith(SIGNATURE_PREFIX) || signatureDataUrl.length < 200) {
    return { ok: false, error: 'Please sign in the box before approving.' };
  }
  if (signatureDataUrl.length > SIGNATURE_MAX_CHARS) {
    return { ok: false, error: 'That signature is too large to store. Clear it and sign again.' };
  }

  const h = await headers();
  const record: ApprovalRecord = {
    signedName,
    signatureDataUrl,
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
