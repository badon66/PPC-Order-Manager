import type { StartingPoint } from '@/lib/types';
import { variantOf } from './intake-logic';

/**
 * The confirmation a team gets the moment their website enquiry lands.
 *
 * Pure: composes subject, plain text and HTML from the enquiry and the link.
 * Sending lives in `src/lib/intake-confirm.ts`, so this can be tested
 * without a mailbox.
 *
 * Written like the order page: plain words, the link first, the same three
 * promises the page makes, and the email alternative for files. Nothing
 * about prices — quotes come from Keenan, not from an automatic email.
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

export const INFO_EMAIL = 'info@powerplaycustoms.ca';
export const PHONE_DISPLAY = '+1 (403) 895-9915';
export const PHONE_TEL = '+14038959915';
export const SITE_URL = 'https://www.powerplaycustoms.ca';

/** What their page asks for, by the route they picked on the website. */
const NEXT_LINE = {
  ready:
    "That's where you upload your logos and any inspiration, and tell us whether your roster is ready.",
  scratch:
    "That's where you drop in any logo you have and pictures of looks you like. No logo yet is fine.",
  reorder:
    "That's where you fill in your roster (names, numbers, sizes) and check the shipping details, or upload the list you already have.",
} as const;

const REPLACED_LINE = 'This link replaces the one in our earlier email today. Use this one from now on.';

const STEPS = [
  'We reply within 2 hours during business hours.',
  'You get a free mockup, the same day.',
  'Nothing is locked in until you approve the proof.',
];

export function firstNameOf(full: string): string {
  const first = full.trim().split(/\s+/)[0] ?? '';
  return first || 'there';
}

/** HTML-escape anything the customer typed before it goes into markup. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function composeEnquiryMail(i: EnquiryMailInput): MailContent {
  const variant = variantOf(i.startingPoint) ?? 'scratch';
  const first = firstNameOf(i.customerName);
  const team = i.teamName.trim() || 'your team';
  const nextLine = NEXT_LINE[variant];

  const subject = `We've got your enquiry — ${team}`;

  const text = [
    `Hi ${first},`,
    '',
    `Thanks for getting in touch about ${team}. We reply within 2 hours during business hours, and you'll have a free mockup the same day.`,
    '',
    "Your team's page:",
    i.rosterUrl,
    '',
    nextLine,
    ...(i.created ? [] : [REPLACED_LINE]),
    '',
    `You can also email your files to ${INFO_EMAIL} — just put your team name in the subject.`,
    '',
    'What happens next',
    ...STEPS.map((s, n) => `${n + 1}. ${s}`),
    '',
    `Questions? Reply to this email, or call or text ${PHONE_DISPLAY}.`,
    '',
    'Powerplay Customs',
    `Calgary, Alberta · ${SITE_URL}`,
  ].join('\n');

  const p = (inner: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1c1c1c;">${inner}</p>`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f3f3;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f3;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;">
<tr><td style="background:#1c1c1c;padding:18px 28px;">
<span style="font-size:18px;font-weight:700;letter-spacing:.04em;color:#fcbd00;">POWERPLAY</span> <span style="font-size:13px;font-weight:700;letter-spacing:.14em;color:#e2e2e2;">CUSTOMS</span>
</td></tr>
<tr><td style="padding:28px 28px 8px;">
${p(`Hi ${esc(first)},`)}
${p(`Thanks for getting in touch about <strong>${esc(team)}</strong>. We reply within 2 hours during business hours, and you'll have a free mockup the same day.`)}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;"><tr><td style="background:#fcbd00;border-radius:8px;">
<a href="${esc(i.rosterUrl)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#1c1c1c;text-decoration:none;">Open your team's page →</a>
</td></tr></table>
${p(`${esc(nextLine)}${i.created ? '' : ' ' + esc(REPLACED_LINE)}`)}
${p(`You can also email your files to <a href="mailto:${INFO_EMAIL}" style="color:#b8860b;font-weight:700;text-decoration:none;">${INFO_EMAIL}</a> — just put your team name in the subject.`)}
<p style="margin:22px 0 8px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b6b6b;">What happens next</p>
<ol style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1c1c1c;">${STEPS.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
${p(`Questions? Reply to this email, or call or text <a href="tel:${PHONE_TEL}" style="color:#1c1c1c;font-weight:700;text-decoration:none;">${PHONE_DISPLAY}</a>.`)}
</td></tr>
<tr><td style="padding:14px 28px 24px;border-top:1px solid #ececec;font-size:13px;line-height:1.6;color:#6b6b6b;">
Powerplay Customs · Calgary, Alberta · <a href="${SITE_URL}" style="color:#6b6b6b;">powerplaycustoms.ca</a><br>
If you didn't send this enquiry, you can ignore this email.
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, text, html };
}
