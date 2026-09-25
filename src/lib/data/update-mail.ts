import type { UpdateStage } from '@/lib/types';
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
  amount: string;
  howToPay: string;
  estimatedFinishDate: string | null;
  trackingCode: string;
  paymentReceivedFirst: boolean;
  nextAfterApproval: 'production' | 'deposit';
  approvedBy: string;
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
  button: { href: string; label: string; dark?: boolean };
  /** A second button, only Completed uses it. */
  button2?: { href: string; label: string };
  /** Quiet closing line. */
  muted?: string;
  hero: boolean;
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
        ],
        button: { href: i.rosterUrl, label: 'Send logos and inspiration' },
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
        button: { href: i.rosterUrl, label: 'Fill in roster and details' },
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
        muted: `Reply to this email once it's sent and ${SPECIALIST} will confirm.`,
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
          `The ${team} proof is ready. Check the design, every name and number, the sizes and the shipping address, then sign off.`,
          "Once it's approved nothing changes, so look twice.",
        ],
        button: { href: i.shareUrl, label: 'Review and approve' },
        muted: 'Spot something wrong? Reply to this email before you approve.',
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
        lines: [`${team} is approved and ready for production. To start, we need the pre-production deposit of ${i.amount}.`],
        box: pay,
        button: { href: i.shareUrl, label: 'See your order' },
        muted: `Reply to this email once it's sent and ${SPECIALIST} will get production started.`,
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
    case 'in_production':
      return {
        subject: `Your jerseys are in production — ${team}`,
        preheader: "They're being made. Here's what to expect.",
        headline: "They're being made.",
        lines: [
          `${team} is in production.${i.estimatedFinishDate ? ` Estimated finish: ${formatLong(i.estimatedFinishDate)}.` : ''}`,
        ],
        box: { eyebrow: 'While they are being made', text: PRODUCTION_NOTE, typed: false },
        button: { href: i.rosterUrl, label: "Your team's page", dark: true },
        muted: 'Production usually takes 2 to 4 weeks. Shipping across Canada is free.',
        hero: true,
      };
    case 'final_payment_requested':
      return {
        subject: `Final payment — ${team}`,
        preheader: 'The jerseys are done. The final payment releases them.',
        headline: `The jerseys are done, ${first}.`,
        lines: [`${team} is finished and ready to ship. The final payment of ${i.amount} releases it.`],
        box: pay,
        button: { href: i.shareUrl, label: 'See your order' },
        muted: `Reply to this email once it's sent and ${SPECIALIST} will get it on its way.`,
        hero: false,
      };
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
        lines: [
          `It was a pleasure making them for ${team}.${i.googleReviewUrl || i.referralLine ? ' Two small asks, if you have a minute:' : ''}`,
          ...(i.referralLine ? [i.referralLine] : []),
        ],
        button: i.googleReviewUrl ? { href: i.googleReviewUrl, label: 'Review us on Google' } : { href: i.rosterUrl, label: "Your team's page", dark: true },
        button2: i.googleReviewUrl ? { href: i.rosterUrl, label: "Your team's page" } : undefined,
        muted: "Next season: reply to this email and we'll reorder from your design, no setup.",
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
${d.box ? mBox(esc(d.box.eyebrow), d.box.typed ? esc(d.box.text) : d.box.text) : ''}
${mButton(d.button.href, esc(d.button.label), d.button.dark)}
${d.button2 ? mButton(d.button2.href, esc(d.button2.label)) : ''}
${d.muted ? mMuted(esc(d.muted)) : ''}
</td></tr>`;

  const html = mailShell({ subject: d.subject, preheader: d.preheader, hero: d.hero, body });
  return { subject: d.subject, text, html };
}
