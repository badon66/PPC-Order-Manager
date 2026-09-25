import type { StartingPoint } from '@/lib/types';
import { variantOf } from './intake-logic';
import {
  COMPARE_URL,
  FAQ_URL,
  IMAGES,
  INFO_EMAIL,
  MAIL_FF,
  PHONE_DISPLAY,
  PHONE_TEL,
  SITE_URL,
  SPECIALIST,
  esc,
  firstNameOf,
  mButton,
  mEyebrow,
  mMuted,
  mp,
  mailShell,
} from './mail-layout';

export { INFO_EMAIL, PHONE_DISPLAY, PHONE_TEL, SITE_URL, COMPARE_URL, FAQ_URL, SPECIALIST, IMAGES, esc, firstNameOf } from './mail-layout';

/**
 * The confirmation a team gets the moment their website enquiry lands.
 *
 * Pure: composes subject, plain text and HTML from the enquiry and the link.
 * Sending lives in `src/lib/intake-confirm.ts`, so this can be tested
 * without a mailbox.
 *
 * Designed with Keenan on 2026-09-23 (K:\PP Customs\Website\changes\
 * 2026-09-23-confirmation-email\mockup-v2.html is the reference render):
 * few words, photos, "you've been assigned to Keenan", the two-hour reply
 * promise, an "In a rush?" banner with three short steps, and two tiles
 * that point at the comparison chart and the FAQ. Nothing about prices;
 * quotes come from Keenan, not from an automatic email.
 *
 * The HTML is built from the shared shell and helpers in `./mail-layout`,
 * which every other status email (Task 5) also builds from, so they all
 * look like the same sender.
 */

export interface EnquiryMailInput {
  customerName: string;
  teamName: string;
  startingPoint: StartingPoint;
  /** The team's own page on the manager, /roster/<token>. */
  rosterUrl: string;
  /** false when this enquiry replaced one from earlier today — the link changed. */
  created: boolean;
}

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

/** The three things their page asks for, by the route they picked on the website. */
const STEPS = {
  ready: ['Drop in your logo and any inspiration.', 'Tell us if your roster is ready.'],
  scratch: ['Drop in any logo you have and pictures of looks you like. No logo yet is fine.', 'Tell us if your roster is ready.'],
  reorder: ['Fill in your roster (names, numbers, sizes), or upload the list you already have.', 'Check the shipping details.'],
} as const;

const REPLACED_LINE = 'This link replaces the one in our earlier email today. Use this one from now on.';
const PROMISE = 'Free mockup the same day. Nothing is locked in until you approve it.';
const ASSIGNED = `You've been assigned to one of our jersey specialists, ${SPECIALIST}. Expect a reply within 2 hours during business hours.`;

export function composeEnquiryMail(i: EnquiryMailInput): MailContent {
  const variant = variantOf(i.startingPoint) ?? 'scratch';
  const first = firstNameOf(i.customerName);
  const team = i.teamName.trim() || 'your team';
  const steps = STEPS[variant];

  const subject = `We've got your enquiry — ${team}`;
  const preheader = `${team}: assigned to ${SPECIALIST}. Reply within 2 hours in business hours, free mockup the same day.`;

  const text = [
    `We've got it, ${first}.`,
    '',
    ASSIGNED,
    '',
    'In a rush? Get ahead of the next steps.',
    `1. Open your team's page: ${i.rosterUrl}`,
    `2. ${steps[0]}`,
    `3. ${steps[1]}`,
    ...(i.created ? [] : [REPLACED_LINE]),
    '',
    PROMISE,
    '',
    'While you wait',
    `Compare the jerseys: ${COMPARE_URL}`,
    `Common questions: ${FAQ_URL}`,
    '',
    `Prefer email? Send your files to ${INFO_EMAIL} with your team name in the subject.`,
    `Questions? Reply to this email, or call or text ${PHONE_DISPLAY}.`,
    '',
    SPECIALIST,
    `Powerplay Customs · Calgary, Alberta · ${SITE_URL}`,
    "If this enquiry wasn't you, ignore this email.",
  ].join('\n');

  const stepRow = (n: number, s: string, last = false) => {
    const pad = last ? '0 0 4px' : '0 0 14px';
    return `<tr><td valign="top" width="34" style="padding:${pad};${MAIL_FF}font-size:16px;line-height:26px;font-weight:800;color:#fcbd00;">${n}</td><td valign="top" style="padding:${pad};${MAIL_FF}font-size:16px;line-height:26px;color:#1c1c1c;">${esc(s)}</td></tr>`;
  };
  const tile = (href: string, img: string, title: string, sub: string) =>
    `<div class="col" style="display:inline-block;width:300px;vertical-align:top;"><a href="${esc(href)}" style="text-decoration:none;"><img src="${esc(img)}" width="300" height="200" alt="" style="width:100%;height:auto;border-radius:8px;border:0;display:block;"><p style="margin:12px 0 2px;${MAIL_FF}font-size:16px;line-height:22px;font-weight:800;color:#1c1c1c;">${title}&nbsp;&rarr;</p><p style="margin:0;${MAIL_FF}font-size:14px;line-height:20px;color:#6b6b6b;">${sub}</p></a></div>`;

  const body = `<tr><td class="pad" style="background:#ffffff;padding:34px 40px 28px;">
<h1 class="h1" style="margin:0 0 14px;${MAIL_FF}font-size:32px;line-height:38px;font-weight:800;color:#1c1c1c;">We've got it, ${esc(first)}.</h1>
${mp(`You've been assigned to one of our jersey specialists, <strong>${SPECIALIST}</strong>. Expect a reply within <strong>2 hours</strong> during business hours.`, 'margin-bottom:22px;')}
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="middle" style="padding-right:14px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" style="width:56px;height:56px;border-radius:28px;background:#fcbd00;${MAIL_FF}font-size:22px;font-weight:800;color:#1c1c1c;">${SPECIALIST[0]}</td></tr></table></td>
<td valign="middle"><p style="margin:0;${MAIL_FF}font-size:15px;line-height:20px;font-weight:800;color:#1c1c1c;">${SPECIALIST}</p><p style="margin:2px 0 0;${MAIL_FF}font-size:14px;line-height:20px;color:#6b6b6b;">Jersey specialist &middot; <a href="tel:${PHONE_TEL}" style="color:#6b6b6b;text-decoration:none;">${PHONE_DISPLAY}</a></p></td>
</tr></table>
</td></tr>
<tr><td class="pad" style="background:#fcbd00;padding:16px 40px;">
${mEyebrow('In a rush?', '#1c1c1c')}
<p style="margin:2px 0 0;${MAIL_FF}font-size:20px;line-height:26px;font-weight:800;color:#1c1c1c;">Get ahead of the next steps.</p>
</td></tr>
<tr><td class="pad" style="background:#ffffff;padding:26px 40px 30px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
${stepRow(1, "Open your team's page below.")}
${stepRow(2, steps[0])}
${stepRow(3, steps[1], true)}
</table>
${mButton(i.rosterUrl, "Open your team's page", true)}
${i.created ? '' : mMuted(esc(REPLACED_LINE), 'margin-bottom:10px;font-weight:600;color:#1c1c1c;')}
${mMuted(PROMISE)}
</td></tr>
<tr><td class="pad" style="background:#ffffff;border-top:1px solid #e6e6e6;padding:28px 40px 16px;">${mEyebrow('While you wait', '#8a8a8a')}</td></tr>
<tr><td class="pad" align="center" style="background:#ffffff;padding:0 40px 30px;font-size:0;line-height:0;text-align:left;">
${tile(COMPARE_URL, IMAGES.compare, 'Compare the jerseys', 'Which of our five models is best for you.')}<div class="col col-gap" style="display:inline-block;width:20px;height:1px;vertical-align:top;"></div>${tile(FAQ_URL, IMAGES.faq, 'Common questions', 'Timelines, deposits, sizing and more.')}
</td></tr>`;

  const html = mailShell({
    subject,
    preheader,
    hero: true,
    body,
    footerNote: "If this enquiry wasn't you, ignore this email.",
  });

  return { subject, text, html };
}
