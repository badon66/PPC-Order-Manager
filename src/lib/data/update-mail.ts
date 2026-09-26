import type { PaymentKind, UpdateStage } from '@/lib/types';
import { PAYMENT_KIND_LABEL } from '@/lib/types';
import { formatLong } from '@/lib/dates';
import type { MailContent } from './intake-mail';
import { PRODUCTION_NOTE } from './timeline';
import { MAIL_FF, SPECIALIST, esc, mBox, mButton, mMuted, mailShell, mp, textFooter } from './mail-layout';

/**
 * The email for each stage of an order. Pure: input in, subject/text/html out.
 *
 * Short on purpose: a headline, a line or two, the one fact that matters, one
 * button. Money appears only in the three request emails, and only as the
 * amount Keenan typed — see the money rule in CLAUDE.md.
 */

export interface UpdateMailInput {
  teamName: string;
  firstName: string;
  rosterUrl: string;
  shareUrl: string;
  /** The two stage pages, e.g. `design_talk`'s "send logos and inspiration" and `finalizing_details`'s roster form. */
  designUrl: string;
  detailsUrl: string;
  amount: string;
  howToPay: string;
  estimatedFinishDate: string | null;
  trackingCode: string;
  paymentReceivedFirst: boolean;
  /** Did this "in production" email follow right after the pre-production deposit gate? */
  cameFromGate: boolean;
  nextAfterApproval: 'production' | 'deposit';
  approvedBy: string;
  /** Which payment `payment_received` is confirming. */
  paymentKind: PaymentKind;
  /** Finished-jersey photos to attach to `final_payment_requested`. Empty elsewhere. */
  photos: Array<{ cid: string; name: string }>;
  googleReviewUrl: string;
  referralLine: string;
}

interface Draft {
  subject: string;
  preheader: string;
  headline: string;
  /** Plain sentences, in order. Each becomes a paragraph. */
  lines: string[];
  /** A boxed aside. `typed` is true when `text` is something a person typed and must be escaped. */
  box?: { eyebrow: string; text: string; typed: boolean };
  /** Extra HTML rendered between the lines and the box — only the photo grid on `final_payment_requested` uses this. */
  extraHtml?: string;
  button: { href: string; label: string; dark?: boolean };
  /** A second button. Nothing uses it any more, but composeUpdateMail still supports it. */
  button2?: { href: string; label: string };
  /** Quiet closing line. */
  muted?: string;
  hero: boolean;
}

/**
 * Two photos per row. `cid` is sender-guaranteed to be `[a-z0-9-]`, so it
 * needs no escaping; `name` is a filename someone else chose, so it does.
 */
function photoGridHtml(photos: Array<{ cid: string; name: string }>): string {
  if (!photos.length) return '';
  const img = (p: { cid: string; name: string }) =>
    `<td width="300" style="padding:0 0 12px;"><img src="cid:${p.cid}" width="300" alt="${esc(p.name)}" style="width:100%;max-width:300px;height:auto;border-radius:8px;border:0;display:block;"></td>`;
  const rows: string[] = [];
  for (let n = 0; n < photos.length; n += 2) {
    rows.push(`<tr>${photos.slice(n, n + 2).map(img).join('')}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;"><tbody>${rows.join('')}</tbody></table>`;
}

const PAYMENT_RECEIVED_NEXT: Record<PaymentKind, string> = {
  initial_deposit: `Design work carries on, and you'll hear from ${SPECIALIST} with the next mockup.`,
  production_deposit: "Production is next. You'll get a note when it starts.",
  final_payment: 'Your tracking number follows shortly, as soon as it ships.',
};

function draft(stage: UpdateStage, i: UpdateMailInput): Draft {
  const team = i.teamName.trim() || 'your team';
  const first = i.firstName.trim() || 'there';
  const pay = { eyebrow: 'How to pay', text: i.howToPay, typed: true };
  switch (stage) {
    case 'design_talk':
      return {
        subject: `Your design is underway — ${team}`,
        preheader: 'Send your logo, colours and any looks you like, and Keenan will draw it up.',
        headline: `Let's design your jerseys, ${first}.`,
        lines: [
          `${SPECIALIST} has started on the ${team} design. The fastest way to a mockup you love is to send everything you've got: your logo in any format, your colours, and pictures of looks you like.`,
          "No logo yet is fine. Tell us the idea and we'll draw it.",
          "Got team colours in mind? There's a spot for those too.",
        ],
        button: { href: i.designUrl, label: 'Send logos and inspiration' },
        muted: "Free mockup the same day, and we keep going until it's right.",
        hero: false,
      };
    case 'finalizing_details':
      return {
        subject: `Roster and details, please — ${team}`,
        preheader: 'Names, numbers, sizes and where the box should go.',
        headline: `Nearly there, ${first}.`,
        lines: [
          `The design is settled. To build the ${team} order we need each player's name as it should print, their number, and jersey and sock sizes, plus the contact and shipping details for the box.`,
        ],
        button: { href: i.detailsUrl, label: 'Fill in roster and details' },
        muted: 'Type it in or upload the list you already have. You can change it right up until production.',
        hero: false,
      };
    case 'initial_deposit_requested':
      return {
        subject: `Initial deposit for ${team}`,
        preheader: 'A small deposit to keep the design work moving. It comes off your total.',
        headline: 'A small deposit to keep things moving.',
        lines: [
          `To keep the design work going on ${team}, we ask for an initial deposit of ${i.amount}. It comes straight off your total.`,
        ],
        box: pay,
        button: { href: i.shareUrl, label: 'See your order' },
        muted: "Once it's received, you'll get a follow-up email confirming it.",
        hero: false,
      };
    case 'initial_deposit_received':
      return {
        subject: `Deposit received — ${team}`,
        preheader: 'Your initial deposit has landed. Design work carries on.',
        headline: `Got it, thanks ${first}.`,
        lines: [`Your initial deposit for ${team} has landed. Design work carries on, and you'll hear from ${SPECIALIST} with the next mockup.`],
        button: { href: i.rosterUrl, label: "Your team's page", dark: true },
        hero: false,
      };
    case 'proof_ready':
      return {
        subject: `Your proof is ready to approve — ${team}`,
        preheader: 'Check every name, number and size, then sign off.',
        headline: `Ready for your sign-off, ${first}.`,
        lines: [
          `The ${team} proof is ready. This sheet is exactly what our factory sees: the names, numbers and sizes on it are what gets printed.`,
          "Check every line, then sign off. Once it's approved nothing changes, so look twice.",
        ],
        button: { href: i.shareUrl, label: 'Review and approve' },
        muted: `Spot something wrong? Reach out to your sales representative, or to ${SPECIALIST} directly, before you approve.`,
        hero: false,
      };
    case 'approval_confirmed':
      return {
        subject: `Approved. Thanks, ${(i.approvedBy || first).split(/\s+/)[0]} — ${team}`,
        preheader: 'Your sign-off is recorded. Here is what happens next.',
        headline: 'Approved.',
        lines: [
          `${team} is signed off. From here the design is locked in.`,
          i.nextAfterApproval === 'production'
            ? "Next up: production. You'll get a note when it starts, with the estimated finish."
            : `Next up: the pre-production deposit. ${SPECIALIST} will send the details.`,
        ],
        button: { href: i.rosterUrl, label: "Your team's page", dark: true },
        hero: false,
      };
    case 'production_deposit_requested':
      return {
        subject: `Deposit before production — ${team}`,
        preheader: 'One step before we start making them.',
        headline: 'One step before we start making them.',
        lines: [`${team} is approved and ready for production. To start, we need the pre-production deposit, 50% of the order: ${i.amount}.`],
        box: pay,
        button: { href: i.shareUrl, label: 'See your order' },
        muted: "Once it's received, you'll get a follow-up email confirming it, and production starts.",
        hero: false,
      };
    case 'production_deposit_received':
      return {
        subject: `Deposit received, production is next — ${team}`,
        preheader: "Your deposit is in. The order goes to production next.",
        headline: `Thanks, ${first}. We're on it.`,
        lines: [`Your deposit for ${team} is in. The order goes to production next, and you'll get a note when it starts.`],
        button: { href: i.rosterUrl, label: "Your team's page", dark: true },
        hero: false,
      };
    case 'in_production': {
      const estimate = i.estimatedFinishDate ? ` Estimated finish: ${formatLong(i.estimatedFinishDate)}.` : '';
      return {
        subject: `Your jerseys are in production — ${team}`,
        preheader: "They're being made. Here's what to expect.",
        headline: "They're being made.",
        lines: [
          i.cameFromGate
            ? `We received your payment, and ${team} is in production.${estimate}`
            : `${team} is in production.${estimate}`,
        ],
        box: { eyebrow: 'While they are being made', text: PRODUCTION_NOTE, typed: false },
        button: { href: i.rosterUrl, label: "Your team's page", dark: true },
        muted: 'Production usually takes 2 to 4 weeks. Shipping across Canada is free.',
        hero: true,
      };
    }
    case 'final_payment_requested': {
      const photos = i.photos;
      return {
        subject: `Final payment — ${team}`,
        preheader: 'The jerseys are done. The final payment releases them.',
        headline: `The jerseys are done, ${first}.`,
        lines: [
          `${team} is finished and ready to ship. The final payment of ${i.amount} releases it.`,
          "Once it's received, you'll get your tracking number shortly after.",
          ...(photos.length ? ['Photos of the finished jerseys are attached.'] : []),
        ],
        box: pay,
        extraHtml: photoGridHtml(photos),
        button: { href: i.shareUrl, label: 'See your order' },
        muted: `Reply to this email once it's sent and ${SPECIALIST} will get it on its way.`,
        hero: false,
      };
    }
    case 'shipped':
      return {
        subject: `Your jerseys have shipped — ${team}`,
        preheader: `On their way. Tracking: ${i.trackingCode}`,
        headline: i.paymentReceivedFirst ? "Payment received, and they're on their way." : "They're on their way.",
        lines: [`${team} has shipped.`],
        box: { eyebrow: 'Tracking number', text: i.trackingCode, typed: true },
        button: { href: i.rosterUrl, label: "Your team's page", dark: true },
        muted: "Give it a day for the carrier's site to update. Shipping across Canada is free; cross-border orders can be held at customs for a few days.",
        hero: false,
      };
    case 'completed':
      return {
        subject: `Thanks from Powerplay Customs — ${team}`,
        preheader: 'Enjoy the jerseys. Two small asks, if you have a minute.',
        headline: `Enjoy the jerseys, ${first}.`,
        lines: [`It was a pleasure making them for ${team}.`],
        button: { href: i.rosterUrl, label: "Your team's page", dark: true },
        muted: "Next season: reply to this email and we'll reorder from your design, no setup.",
        hero: true,
      };
    case 'payment_received': {
      const kind = i.paymentKind;
      return {
        subject: `Payment received — ${team}`,
        preheader: "Got it, thanks. Here's what happens next.",
        headline: `Got it, thanks ${first}.`,
        lines: [`We received your ${PAYMENT_KIND_LABEL[kind]} for ${team}.`, PAYMENT_RECEIVED_NEXT[kind]],
        button: { href: i.rosterUrl, label: "Your team's page", dark: true },
        hero: false,
      };
    }
    case 'review_request':
      return {
        subject: `How are the jerseys? — ${team}`,
        preheader: 'A quick favour, if you have a minute.',
        headline: `How are the ${team} jerseys?`,
        lines: [
          "Now that they've had a few games, we'd love to hear how they're holding up.",
          i.googleReviewUrl ? "If you're happy with them, a short Google review helps the next team find us." : '',
          i.referralLine,
        ].filter(Boolean),
        button: i.googleReviewUrl
          ? { href: i.googleReviewUrl, label: 'Review us on Google' }
          : { href: i.rosterUrl, label: "Your team's page", dark: true },
        muted: `If anything isn't right, reply to this email and ${SPECIALIST} will sort it.`,
        hero: true,
      };
  }
}

export function composeUpdateMail(stage: UpdateStage, i: UpdateMailInput): MailContent {
  const d = draft(stage, i);

  const text = [
    d.headline,
    '',
    ...d.lines,
    ...(d.box ? ['', `${d.box.eyebrow}: ${d.box.text}`] : []),
    '',
    `${d.button.label}: ${d.button.href}`,
    ...(d.button2 ? [`${d.button2.label}: ${d.button2.href}`] : []),
    ...(d.muted ? ['', d.muted] : []),
    '',
    ...textFooter(),
  ].join('\n');

  const body = `<tr><td class="pad" style="background:#ffffff;padding:34px 40px 30px;">
<h1 class="h1" style="margin:0 0 14px;${MAIL_FF}font-size:32px;line-height:38px;font-weight:800;color:#1c1c1c;">${esc(d.headline)}</h1>
${d.lines.map((l, n) => mp(esc(l), n < d.lines.length - 1 ? 'margin-bottom:12px;' : '')).join('\n')}
${d.extraHtml ?? ''}
${d.box ? mBox(esc(d.box.eyebrow), d.box.typed ? esc(d.box.text) : d.box.text) : ''}
${mButton(d.button.href, esc(d.button.label), d.button.dark)}
${d.button2 ? mButton(d.button2.href, esc(d.button2.label)) : ''}
${d.muted ? mMuted(esc(d.muted)) : ''}
</td></tr>`;

  const html = mailShell({ subject: d.subject, preheader: d.preheader, hero: d.hero, body });
  return { subject: d.subject, text, html };
}
