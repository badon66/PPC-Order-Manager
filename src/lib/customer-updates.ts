import { repo } from '@/lib/data';
import type { Actor } from '@/lib/data/repository';
import { MONEY_STAGES, defaultPaymentKind, dueUpdates, recipientOf, statusAfterApproval } from '@/lib/data/customer-updates-logic';
import { everInStatus } from '@/lib/data/timeline';
import { stagePagePaths } from '@/lib/data/stage-pages';
import { composeUpdateMail, type UpdateMailInput } from '@/lib/data/update-mail';
import { firstNameOf } from '@/lib/data/mail-layout';
import { mailConfigured, sendMail, type MailAttachment } from '@/lib/mail';
import { resolveFileUrl } from '@/lib/storage';
import { baseUrl } from '@/lib/base-url';
import { PAYMENT_KIND_LABEL } from '@/lib/types';
import type { AppSettings, ChangeLogEntry, Order, OrderAsset, PaymentKind, UpdateStage } from '@/lib/types';

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
  /** Which payment `payment_received` is confirming. Defaults from the order's own status — see `defaultPaymentKind`. */
  paymentKind?: PaymentKind;
}

/** The most recent `status_changed` entry, or null. History normally arrives
 *  newest-first already, but this re-sorts rather than trust the caller. */
function lastStatusChange(history: ChangeLogEntry[]): ChangeLogEntry | null {
  const hits = history.filter((h) => h.action === 'status_changed').sort((a, b) => b.at.localeCompare(a.at));
  return hits[0] ?? null;
}

export function mailInputFor(order: Order, history: ChangeLogEntry[], settings: AppSettings, base: string, opts: SendUpdateOptions): UpdateMailInput {
  const stagePaths = stagePagePaths(order.rosterToken);
  const gate = lastStatusChange(history);
  return {
    teamName: order.teamName,
    firstName: firstNameOf(order.contactFirstName ?? ''),
    rosterUrl: `${base}/roster/${order.rosterToken}`,
    shareUrl: `${base}/share/${order.shareToken}`,
    designUrl: `${base}${stagePaths.design}`,
    detailsUrl: `${base}${stagePaths.details}`,
    amount: (opts.amount ?? '').trim(),
    howToPay: (opts.howToPay ?? settings.howToPay).trim(),
    estimatedFinishDate: order.estimatedFinishDate,
    trackingCode: (order.trackingCode ?? '').trim(),
    paymentReceivedFirst: everInStatus('waiting_for_payment', history, order.status),
    cameFromGate: gate?.fromValue === 'waiting_for_production_deposit' && gate?.toValue === order.status,
    nextAfterApproval: statusAfterApproval(order.status, history) === 'in_production' || order.status === 'in_production' ? 'production' : 'deposit',
    approvedBy: order.approvedBy ?? '',
    paymentKind: opts.paymentKind ?? defaultPaymentKind(order.status),
    // Filled in by sendCustomerUpdate for final_payment_requested, once the
    // attachments are actually built — this function has no asset access.
    photos: [],
    googleReviewUrl: settings.googleReviewUrl.trim(),
    referralLine: settings.referralLine.trim(),
  };
}

/** How large a single finished-jersey photo attachment may be. Generous
 *  enough for a real photo; small enough that eight of them don't bounce off
 *  a mail provider's total-message-size ceiling. */
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

interface ChosenPhoto {
  cid: string;
  name: string;
  asset: OrderAsset;
}

/** The finished-jersey photos `final_payment_requested` attaches: up to 8, in slot order. */
function chooseFinishedPhotos(assets: OrderAsset[]): ChosenPhoto[] {
  return assets
    .filter((a) => a.role === 'finished_photo')
    .sort((a, b) => a.slot - b.slot)
    .slice(0, 8)
    .map((asset, n) => ({ cid: `photo-${n + 1}`, name: asset.displayName || asset.fileName, asset }));
}

/**
 * Download the chosen photos as mail attachments. Best effort per photo: one
 * that fails to fetch, or comes back over the size limit, is skipped and
 * logged rather than thrown — a bad photo must not cost the customer the
 * whole final-payment email. The returned `photos` list only names the ones
 * that actually made it into `attachments`, so the email's photo grid never
 * points at a cid that has nothing behind it.
 */
async function buildPhotoAttachments(
  orderId: string,
  chosen: ChosenPhoto[],
): Promise<{ attachments: MailAttachment[]; photos: Array<{ cid: string; name: string }> }> {
  const attachments: MailAttachment[] = [];
  const photos: Array<{ cid: string; name: string }> = [];
  for (const p of chosen) {
    try {
      const url = await resolveFileUrl(p.asset.fileUrl);
      if (!url) {
        console.log(`[updates] photo skipped (no URL) for order ${orderId}: ${p.name}`);
        continue;
      }
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`[updates] photo skipped (HTTP ${res.status}) for order ${orderId}: ${p.name}`);
        continue;
      }
      const content = Buffer.from(await res.arrayBuffer());
      if (content.byteLength > MAX_PHOTO_BYTES) {
        console.log(`[updates] photo skipped (${content.byteLength} bytes, over the 6 MB limit) for order ${orderId}: ${p.name}`);
        continue;
      }
      attachments.push({ filename: p.name, content, contentType: res.headers.get('content-type') ?? 'image/jpeg', cid: p.cid });
      photos.push({ cid: p.cid, name: p.name });
    } catch (e) {
      console.log(`[updates] photo skipped (${(e as Error).message}) for order ${orderId}: ${p.name}`);
    }
  }
  return { attachments, photos };
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
  const { order, assets } = bundle;
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
  const mailInput = mailInputFor(order, history, settings, await baseUrl(), opts);

  // Only the final-payment email carries photos, and only the ones that were
  // actually downloaded successfully — see buildPhotoAttachments.
  let attachments: MailAttachment[] = [];
  if (stage === 'final_payment_requested') {
    const built = await buildPhotoAttachments(orderId, chooseFinishedPhotos(assets));
    mailInput.photos = built.photos;
    attachments = built.attachments;
  }

  const mail = composeUpdateMail(stage, mailInput);
  const result = await sendMail({ to, ...mail, attachments });
  if (!result.sent) {
    console.error(`[updates] ${stage} NOT sent to ${to} for order ${orderId}: ${result.reason}`);
    return result;
  }
  console.log(`[updates] ${stage} sent to ${to} for order ${orderId} (${result.id})`);

  // The email is gone; a failure from here on must not look like it wasn't
  // sent. Recording the send and opening the link's sections are best effort —
  // log and tell the caller not to resend, rather than throw past a sent email.
  try {
    await repo.recordCustomerEmail(
      orderId,
      {
        stage,
        sentAt: new Date().toISOString(),
        to,
        messageId: result.id,
        // Never an amount — see the money rule. Just which payment this was.
        detail: stage === 'payment_received' ? PAYMENT_KIND_LABEL[mailInput.paymentKind] : undefined,
      },
      actor,
    );

    // The two link emails promise a page that collects something. Make sure it does.
    const open = SECTIONS_OPENED_BY[stage];
    if (open) {
      await repo.updateOrder(
        orderId,
        { requestClientDetails: true, clientLinkSections: { ...order.clientLinkSections, ...open } },
        actor,
      );
    }
  } catch (e) {
    const message = (e as Error).message;
    console.error(`[updates] ${stage} sent to ${to} for order ${orderId} but not recorded: ${message}`);
    return { sent: false, reason: 'The email went out but could not be recorded. Do not resend; refresh the page and check the history.' };
  }
  return result;
}

/** Which client-link sections a link email switches on when it goes out. */
const SECTIONS_OPENED_BY: Partial<Record<UpdateStage, Partial<Order['clientLinkSections']>>> = {
  design_talk: { logos: true, inspiration: true },
  finalizing_details: { roster: true, personalDetails: true },
};
