import { repo } from '@/lib/data';
import type { Actor } from '@/lib/data/repository';
import { MONEY_STAGES, dueUpdates, recipientOf, statusAfterApproval } from '@/lib/data/customer-updates-logic';
import { everInStatus } from '@/lib/data/timeline';
import { composeUpdateMail, type UpdateMailInput } from '@/lib/data/update-mail';
import { firstNameOf } from '@/lib/data/mail-layout';
import { mailConfigured, sendMail } from '@/lib/mail';
import { baseUrl } from '@/lib/base-url';
import type { AppSettings, ChangeLogEntry, Order, UpdateStage } from '@/lib/types';

/**
 * Send one stage email to the team, and remember that it went.
 *
 * Best effort, like the confirmation: a failure is a return value and a log
 * line, never a throw. The amount for a request email exists only in `opts`
 * and in the message; nothing here stores it.
 */

export interface SendUpdateOptions {
  amount?: string;
  howToPay?: string;
  /** Resend: skip the once-only check. */
  force?: boolean;
}

export function mailInputFor(order: Order, history: ChangeLogEntry[], settings: AppSettings, base: string, opts: SendUpdateOptions): UpdateMailInput {
  return {
    teamName: order.teamName,
    firstName: firstNameOf(order.contactFirstName),
    rosterUrl: `${base}/roster/${order.rosterToken}`,
    shareUrl: `${base}/share/${order.shareToken}`,
    amount: (opts.amount ?? '').trim(),
    howToPay: (opts.howToPay ?? settings.howToPay).trim(),
    estimatedFinishDate: order.estimatedFinishDate,
    trackingCode: order.trackingCode.trim(),
    paymentReceivedFirst: everInStatus('waiting_for_payment', history, order.status),
    nextAfterApproval: statusAfterApproval(order.status, history) === 'in_production' || order.status === 'in_production' ? 'production' : 'deposit',
    approvedBy: order.approvedBy,
    googleReviewUrl: settings.googleReviewUrl.trim(),
    referralLine: settings.referralLine.trim(),
  };
}

export async function sendCustomerUpdate(
  orderId: string,
  stage: UpdateStage,
  opts: SendUpdateOptions,
  actor: Actor,
): Promise<{ sent: true; id: string } | { sent: false; reason: string }> {
  if (!mailConfigured()) return { sent: false, reason: 'Email is not set up on the server (SMTP_USER / SMTP_PASS).' };
  const bundle = await repo.getOrder(orderId);
  if (!bundle) return { sent: false, reason: 'Order not found.' };
  const { order } = bundle;
  const history = await repo.getHistory(orderId);

  const to = recipientOf(order);
  if (!to) return { sent: false, reason: 'No customer email on this order.' };
  if (!opts.force) {
    const due = dueUpdates(order, history).find((d) => d.stage === stage);
    if (!due) return { sent: false, reason: 'That email is not due for this order (already sent, or the order is at a different stage).' };
    if (due.blocked) return { sent: false, reason: due.blocked };
  }
  if (MONEY_STAGES.has(stage) && !(opts.amount ?? '').trim()) return { sent: false, reason: 'Type the amount first.' };


  const settings = await repo.getSettings();
  const mail = composeUpdateMail(stage, mailInputFor(order, history, settings, await baseUrl(), opts));
  const result = await sendMail({ to, ...mail });
  if (!result.sent) {
    console.error(`[updates] ${stage} NOT sent to ${to} for order ${orderId}: ${result.reason}`);
    return result;
  }
  await repo.recordCustomerEmail(orderId, { stage, sentAt: new Date().toISOString(), to, messageId: result.id }, actor);
  console.log(`[updates] ${stage} sent to ${to} for order ${orderId} (${result.id})`);

  // The two link emails promise a page that collects something. Make sure it does.
  const open = SECTIONS_OPENED_BY[stage];
  if (open) {
    await repo.updateOrder(
      orderId,
      { requestClientDetails: true, clientLinkSections: { ...order.clientLinkSections, ...open } },
      actor,
    );
  }
  return result;
}

/** Which client-link sections a link email switches on when it goes out. */
const SECTIONS_OPENED_BY: Partial<Record<UpdateStage, Partial<Order['clientLinkSections']>>> = {
  design_talk: { logos: true, inspiration: true },
  finalizing_details: { roster: true, personalDetails: true },
};
