import type { StartingPoint } from '@/lib/types';
import { variantOf } from './intake-logic';

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
 * The HTML is table-based with inline styles because that is what email
 * clients render. 700px wide on a desktop, one column on a phone, and the
 * hero photo swaps to a taller crop under 720px (Outlook ignores the swap
 * and shows the desktop crop, which is fine).
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
export const COMPARE_URL = `${SITE_URL}/pages/hockey-comparison-chart`;
export const FAQ_URL = `${SITE_URL}/pages/faqs-page-oflrac`;
/** Who the email says the team has been assigned to. */
export const SPECIALIST = 'Keenan';

/**
 * Pictures, all on the CDNs the website already serves from. Shopify's CDN
 * crops on the fly (`width`, `height`, `crop=center`), so one upload gives
 * every size. Swap these when Keenan sends his own photos.
 */
const CDN = 'https://cdn.shopify.com/s/files/1/0654/5349/0385/files';
const TEAM_PHOTO = `${CDN}/gempages_566822059041096785-ee8eb7a8-6bf8-484b-8ca3-a30968a1aa69.jpg`;
export const IMAGES = {
  logo: `${SITE_URL}/cdn/shop/files/PPC_Logo_Lower_RES.png?width=480`,
  heroDesktop: `${TEAM_PHOTO}?width=1400&height=600&crop=center`,
  heroPhone: `${TEAM_PHOTO}?width=800&height=600&crop=center`,
  compare: `${CDN}/jersey-1200.jpg?width=600&height=400&crop=center`,
  faq: `${CDN}/gallery-jersey-01.jpg?width=600&height=400&crop=center`,
} as const;

/** The three things their page asks for, by the route they picked on the website. */
const STEPS = {
  ready: ['Drop in your logo and any inspiration.', 'Tell us if your roster is ready.'],
  scratch: ['Drop in any logo you have and pictures of looks you like. No logo yet is fine.', 'Tell us if your roster is ready.'],
  reorder: ['Fill in your roster (names, numbers, sizes), or upload the list you already have.', 'Check the shipping details.'],
} as const;

const REPLACED_LINE = 'This link replaces the one in our earlier email today. Use this one from now on.';
const PROMISE = 'Free mockup the same day. Nothing is locked in until you approve it.';
const ASSIGNED = `You've been assigned to one of our jersey specialists, ${SPECIALIST}. Expect a reply within 2 hours during business hours.`;

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

  const FF = "font-family:'Montserrat',Arial,Helvetica,sans-serif;";
  const body = (inner: string, extra = '') => `<p style="margin:0;${FF}font-size:16px;line-height:26px;color:#1c1c1c;${extra}">${inner}</p>`;
  const muted = (inner: string, extra = '') => `<p style="margin:0;${FF}font-size:14px;line-height:22px;color:#6b6b6b;${extra}">${inner}</p>`;
  const eyebrow = (inner: string, colour: string) => `<p style="margin:0;${FF}font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${colour};">${inner}</p>`;
  const stepRow = (n: number, s: string, last = false) => {
    const pad = last ? '0 0 4px' : '0 0 14px';
    return `<tr><td valign="top" width="34" style="padding:${pad};${FF}font-size:16px;line-height:26px;font-weight:800;color:#fcbd00;">${n}</td><td valign="top" style="padding:${pad};${FF}font-size:16px;line-height:26px;color:#1c1c1c;">${esc(s)}</td></tr>`;
  };
  const tile = (href: string, img: string, title: string, sub: string) =>
    `<div class="col" style="display:inline-block;width:300px;vertical-align:top;"><a href="${esc(href)}" style="text-decoration:none;"><img src="${esc(img)}" width="300" height="200" alt="" style="width:100%;height:auto;border-radius:8px;border:0;display:block;"><p style="margin:12px 0 2px;${FF}font-size:16px;line-height:22px;font-weight:800;color:#1c1c1c;">${title}&nbsp;&rarr;</p><p style="margin:0;${FF}font-size:14px;line-height:20px;color:#6b6b6b;">${sub}</p></a></div>`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;800&amp;display=swap">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;800&display=swap');
  body { margin:0; padding:0; background:#f2f2f0; -webkit-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  img { border:0; display:block; }
  .col { display:inline-block; width:300px; vertical-align:top; }
  @media only screen and (max-width:720px) {
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:28px !important; line-height:34px !important; }
    .col { width:100% !important; }
    .col-gap { height:22px !important; }
    .hero-desk { display:none !important; }
    .hero-mob { display:block !important; max-height:none !important; overflow:visible !important; }
  }
</style></head>
<body style="margin:0;padding:0;background:#f2f2f0;${FF}">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f2f2f0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f0;"><tr><td align="center" style="padding:24px 12px 36px;">
<table role="presentation" width="700" cellpadding="0" cellspacing="0" style="max-width:700px;width:100%;">
<tr><td align="center" style="background:#1c1c1c;border-radius:12px 12px 0 0;padding:22px 28px 20px;"><a href="${SITE_URL}" style="text-decoration:none;"><img src="${esc(IMAGES.logo)}" width="200" height="60" alt="Powerplay Customs" style="width:200px;height:60px;margin:0 auto;border:0;display:block;"></a></td></tr>
<tr><td style="background:#1c1c1c;">
<div class="hero-desk"><img src="${esc(IMAGES.heroDesktop)}" width="700" height="300" alt="A team in their Powerplay Customs jerseys" style="width:100%;height:auto;max-width:700px;border:0;display:block;"></div>
<!--[if !mso]><!--><div class="hero-mob" style="display:none;max-height:0;overflow:hidden;"><img src="${esc(IMAGES.heroPhone)}" width="700" alt="A team in their Powerplay Customs jerseys" style="width:100%;height:auto;border:0;display:block;"></div><!--<![endif]-->
</td></tr>
<tr><td class="pad" style="background:#ffffff;padding:34px 40px 28px;">
<h1 class="h1" style="margin:0 0 14px;${FF}font-size:32px;line-height:38px;font-weight:800;color:#1c1c1c;">We've got it, ${esc(first)}.</h1>
${body(`You've been assigned to one of our jersey specialists, <strong>${SPECIALIST}</strong>. Expect a reply within <strong>2 hours</strong> during business hours.`, 'margin-bottom:22px;')}
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="middle" style="padding-right:14px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" style="width:56px;height:56px;border-radius:28px;background:#fcbd00;${FF}font-size:22px;font-weight:800;color:#1c1c1c;">${SPECIALIST[0]}</td></tr></table></td>
<td valign="middle"><p style="margin:0;${FF}font-size:15px;line-height:20px;font-weight:800;color:#1c1c1c;">${SPECIALIST}</p><p style="margin:2px 0 0;${FF}font-size:14px;line-height:20px;color:#6b6b6b;">Jersey specialist &middot; <a href="tel:${PHONE_TEL}" style="color:#6b6b6b;text-decoration:none;">${PHONE_DISPLAY}</a></p></td>
</tr></table>
</td></tr>
<tr><td class="pad" style="background:#fcbd00;padding:16px 40px;">
${eyebrow('In a rush?', '#1c1c1c')}
<p style="margin:2px 0 0;${FF}font-size:20px;line-height:26px;font-weight:800;color:#1c1c1c;">Get ahead of the next steps.</p>
</td></tr>
<tr><td class="pad" style="background:#ffffff;padding:26px 40px 30px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
${stepRow(1, "Open your team's page below.")}
${stepRow(2, steps[0])}
${stepRow(3, steps[1], true)}
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 14px;"><tr><td style="background:#1c1c1c;border-radius:8px;"><a href="${esc(i.rosterUrl)}" style="display:inline-block;padding:15px 28px;${FF}font-size:16px;font-weight:800;color:#fcbd00;text-decoration:none;">Open your team's page&nbsp;&rarr;</a></td></tr></table>
${i.created ? '' : muted(esc(REPLACED_LINE), 'margin-bottom:10px;font-weight:600;color:#1c1c1c;')}
${muted(PROMISE)}
</td></tr>
<tr><td class="pad" style="background:#ffffff;border-top:1px solid #e6e6e6;padding:28px 40px 16px;">${eyebrow('While you wait', '#8a8a8a')}</td></tr>
<tr><td class="pad" align="center" style="background:#ffffff;padding:0 40px 30px;font-size:0;line-height:0;text-align:left;">
${tile(COMPARE_URL, IMAGES.compare, 'Compare the jerseys', 'Which of our five models is best for you.')}<div class="col col-gap" style="display:inline-block;width:20px;height:1px;vertical-align:top;"></div>${tile(FAQ_URL, IMAGES.faq, 'Common questions', 'Timelines, deposits, sizing and more.')}
</td></tr>
<tr><td class="pad" style="background:#ffffff;border-top:1px solid #e6e6e6;border-radius:0 0 12px 12px;padding:20px 40px 24px;">
${muted(`Prefer email? Send your files to <a href="mailto:${INFO_EMAIL}" style="color:#1c1c1c;font-weight:600;">${INFO_EMAIL}</a> with your team name in the subject. Questions? Reply to this email, or call or text <a href="tel:${PHONE_TEL}" style="color:#1c1c1c;font-weight:600;text-decoration:none;">${PHONE_DISPLAY}</a>.`)}
</td></tr>
<tr><td class="pad" align="center" style="padding:20px 40px 0;">
<p style="margin:0 0 4px;${FF}font-size:12px;line-height:18px;color:#8a8a8a;">Powerplay Customs &middot; Calgary, Alberta &middot; <a href="${SITE_URL}" style="color:#8a8a8a;">powerplaycustoms.ca</a></p>
<p style="margin:0;${FF}font-size:12px;line-height:18px;color:#8a8a8a;">If this enquiry wasn't you, ignore this email.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, text, html };
}
