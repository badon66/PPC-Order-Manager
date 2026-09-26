import type { PaymentKind, UpdateStage } from '@/lib/types';
import { PAYMENT_KIND_LABEL } from '@/lib/types';
import { formatLong } from '@/lib/dates';
import type { MailContent } from './intake-mail';
import { PRODUCTION_NOTE } from './timeline';
import { sizesWanted, type OrderProducts } from './stage-pages';
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
  /** What's on the order, so `finalizing_details` asks for exactly the sizes the roster form shows. */
  products: OrderProducts;
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
  /** `final_payment_requested` for a team that already paid: the photos and "they ship next", no payment ask. */
  finalPaid: boolean;
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
  /** A second button — the upload link after the initial deposit, the order sheet under "Track with UPS". */
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
  final_payment: 'Your UPS tracking number follows shortly, as soon as it ships.',
};

/** UPS's own tracking page for a tracking number. The shipment is in the customer's name, so UPS is where the answers are. */
export function upsTrackingUrl(code: string): string {
  return `https://www.ups.com/track?tracknum=${encodeURIComponent(code.trim())}`;
}

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
          `The design is settled. To build the ${team} order we need each player's name as it should print, their number, and ${sizesWanted(i.products)}, plus the contact and shipping details for the box.`,
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
        button: { href: i.shareUrl, label: 'See your order', dark: true },
        button2: { href: i.rosterUrl, label: 'Upload your info and files' },
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
        button: { href: i.shareUrl, label: 'See your order', dark: true },
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
        button: { href: i.shareUrl, label: 'See your order', dark: true },
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
        // The order sheet, not the team page: once production starts there's
        // nothing left to fill in, and the sheet shows where it is plus every detail.
        button: { href: i.shareUrl, label: 'See your order', dark: true },
        muted: 'Production usually takes 2 to 4 weeks. Shipping across Canada is free.',
        hero: true,
      };
    }
    // "The jerseys are done": the photos first, then what's needed before they
    // ship. Sent when production finishes — usually before the team pays, so
    // the photos never wait on the money. A team that already paid gets the
    // photos and "they ship next" instead of a payment ask.
    case 'final_payment_requested': {
      const photos = i.photos;
      const done = `Production on ${team} is finished.${photos.length ? ' Here are photos of the finished jerseys.' : ''}`;
      if (i.finalPaid) {
        return {
          subject: `The jerseys are done — ${team}`,
          preheader: 'Production is finished. Photos inside, and they ship next.',
          headline: `The jerseys are done, ${first}.`,
          lines: [done, 'Your final payment is already in, thank you, so they ship next.'],
          extraHtml: photoGridHtml(photos),
          button: { href: i.shareUrl, label: 'See your order' },
          muted: "Your UPS tracking number follows as soon as they're on the way.",
          hero: false,
        };
      }
      return {
        subject: `The jerseys are done — ${team}`,
        preheader: 'Production is finished. Photos inside, and what we need before they ship.',
        headline: `The jerseys are done, ${first}.`,
        lines: [done],
        extraHtml: photoGridHtml(photos),
        // Photos, then the ask: one box with the amount and how to pay. Both
        // are typed by Keenan, so the box is escaped.
        box: { eyebrow: 'Before they ship', text: `The final payment: ${i.amount}. ${i.howToPay}`, typed: true },
        button: { href: i.shareUrl, label: 'See your order' },
        muted: "Once it's received, we ship them, and your UPS tracking number follows shortly after.",
        hero: false,
      };
    }
    case 'shipped':
      return {
        subject: `Your jerseys have shipped — ${team}`,
        preheader: `On their way with UPS. Tracking: ${i.trackingCode}`,
        headline: i.paymentReceivedFirst ? "Payment received, and they're on their way." : "They're on their way.",
        lines: [
          `${team} has left the factory and is on its way to you with UPS. Delivery usually takes 3 to 6 days, depending on any delays and how quickly it clears customs.`,
          "Once it leaves the factory it's in UPS's hands and out of our control. The shipment is in your name, not ours, so UPS has the best and most up-to-date information. For any question about where it is or when it'll arrive, contact UPS directly with your tracking number.",
        ],
        box: { eyebrow: 'UPS tracking number', text: i.trackingCode, typed: true },
        button: { href: upsTrackingUrl(i.trackingCode), label: 'Track with UPS', dark: true },
        button2: { href: i.shareUrl, label: 'See your order' },
        muted: 'Give it a day for UPS tracking to update.',
        hero: false,
      };
    case 'completed':
      return {
        subject: `Thanks from Powerplay Customs — ${team}`,
        preheader: i.googleReviewUrl
          ? 'Enjoy the jerseys. One small favour, if you have a minute.'
          : 'Enjoy the jerseys. Reply any time to reorder from your design.',
        headline: `Enjoy the jerseys, ${first}.`,
        lines: [
          `It was a pleasure making them for ${team}. We hope they're everything you pictured when we started.`,
          i.googleReviewUrl
            ? "One small favour: if you're happy with them, we'd love a quick, honest Google review from you, and from a few of your teammates too. It takes a minute, and it's how the next team finds us."
            : '',
          i.referralLine,
        ].filter(Boolean),
        button: i.googleReviewUrl
          ? { href: i.googleReviewUrl, label: 'Leave a Google review' }
          : { href: i.shareUrl, label: 'See your order', dark: true },
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
        // The order sheet first: after paying, "what did I pay for" is the
        // question. The upload link only while there's still something to
        // send — after the initial deposit the design is still in progress;
        // after the later payments the details are locked in.
        button: { href: i.shareUrl, label: 'See your order', dark: true },
        ...(kind === 'initial_deposit' ? { button2: { href: i.rosterUrl, label: 'Upload your info and files' } } : {}),
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
          : { href: i.shareUrl, label: 'See your order', dark: true },
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
