/**
 * The one email layout. The confirmation email and every update email are
 * built from these pieces so they always look like the same sender.
 *
 * Table-based HTML with inline styles because that is what mail clients
 * render. 700px wide on a desktop, one column on a phone; the hero photo
 * swaps to a taller crop under 720px (Outlook ignores the swap and shows
 * the desktop crop, which is fine).
 */
export const INFO_EMAIL = 'info@powerplaycustoms.ca';
export const PHONE_DISPLAY = '+1 (403) 895-9915';
export const PHONE_TEL = '+14038959915';
export const SITE_URL = 'https://www.powerplaycustoms.ca';
export const COMPARE_URL = `${SITE_URL}/pages/hockey-comparison-chart`;
export const FAQ_URL = `${SITE_URL}/pages/faqs-page-oflrac`;
export const SPECIALIST = 'Keenan';

const CDN = 'https://cdn.shopify.com/s/files/1/0654/5349/0385/files';
const TEAM_PHOTO = `${CDN}/gempages_566822059041096785-ee8eb7a8-6bf8-484b-8ca3-a30968a1aa69.jpg`;
export const IMAGES = {
  logo: `${SITE_URL}/cdn/shop/files/PPC_Logo_Lower_RES.png?width=480`,
  heroDesktop: `${TEAM_PHOTO}?width=1400&height=600&crop=center`,
  heroPhone: `${TEAM_PHOTO}?width=800&height=600&crop=center`,
  compare: `${CDN}/jersey-1200.jpg?width=600&height=400&crop=center`,
  faq: `${CDN}/gallery-jersey-01.jpg?width=600&height=400&crop=center`,
} as const;

export const MAIL_FF = "font-family:'Montserrat',Arial,Helvetica,sans-serif;";

export function firstNameOf(full: string): string {
  const first = full.trim().split(/\s+/)[0] ?? '';
  return first || 'there';
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const mp = (inner: string, extra = '') =>
  `<p style="margin:0;${MAIL_FF}font-size:16px;line-height:26px;color:#1c1c1c;${extra}">${inner}</p>`;
export const mMuted = (inner: string, extra = '') =>
  `<p style="margin:0;${MAIL_FF}font-size:14px;line-height:22px;color:#6b6b6b;${extra}">${inner}</p>`;
export const mEyebrow = (inner: string, colour = '#8a8a8a') =>
  `<p style="margin:0;${MAIL_FF}font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${colour};">${inner}</p>`;

export function mButton(href: string, label: string, dark = false): string {
  const bg = dark ? '#1c1c1c' : '#fcbd00';
  const fg = dark ? '#fcbd00' : '#1c1c1c';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 14px;"><tr><td style="background:${bg};border-radius:8px;"><a href="${esc(href)}" style="display:inline-block;padding:15px 28px;${MAIL_FF}font-size:16px;font-weight:800;color:${fg};text-decoration:none;">${label}&nbsp;&rarr;</a></td></tr></table>`;
}

/** A bordered aside with a gold rule on top: how to pay, a tracking number, the production note. */
export function mBox(eyebrow: string, inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border-top:2px solid #fcbd00;border-bottom:1px solid #e6e6e6;"><tr><td style="padding:14px 0 16px;">${mEyebrow(eyebrow)}<p style="margin:6px 0 0;${MAIL_FF}font-size:16px;line-height:26px;color:#1c1c1c;">${inner}</p></td></tr></table>`;
}

export function textFooter(): string[] {
  return [
    `Prefer email? Write to ${INFO_EMAIL} with your team name in the subject.`,
    `Questions? Reply to this email, or call or text ${PHONE_DISPLAY}.`,
    '',
    SPECIALIST,
    `Powerplay Customs · Calgary, Alberta · ${SITE_URL}`,
  ];
}

/** The general footer line every update email uses: exactly what `mailShell` rendered before `footerLine` existed. */
const DEFAULT_FOOTER_LINE = mMuted(
  `Prefer email? Write to <a href="mailto:${INFO_EMAIL}" style="color:#1c1c1c;font-weight:600;">${INFO_EMAIL}</a> with your team name in the subject. Questions? Reply to this email, or call or text <a href="tel:${PHONE_TEL}" style="color:#1c1c1c;font-weight:600;text-decoration:none;">${PHONE_DISPLAY}</a>.`,
);

export function mailShell(o: { subject: string; preheader: string; hero: boolean; body: string; footerNote?: string; footerLine?: string }): string {
  const hero = o.hero
    ? `<tr><td style="background:#1c1c1c;">
<div class="hero-desk"><img src="${esc(IMAGES.heroDesktop)}" width="700" height="300" alt="A team in their Powerplay Customs jerseys" style="width:100%;height:auto;max-width:700px;border:0;display:block;"></div>
<!--[if !mso]><!--><div class="hero-mob" style="display:none;max-height:0;overflow:hidden;"><img src="${esc(IMAGES.heroPhone)}" width="700" alt="A team in their Powerplay Customs jerseys" style="width:100%;height:auto;border:0;display:block;"></div><!--<![endif]-->
</td></tr>`
    : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(o.subject)}</title>
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
<body style="margin:0;padding:0;background:#f2f2f0;${MAIL_FF}">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f2f2f0;">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f0;"><tr><td align="center" style="padding:24px 12px 36px;">
<table role="presentation" width="700" cellpadding="0" cellspacing="0" style="max-width:700px;width:100%;">
<tr><td align="center" style="background:#1c1c1c;border-radius:12px 12px 0 0;padding:22px 28px 20px;"><a href="${SITE_URL}" style="text-decoration:none;"><img src="${esc(IMAGES.logo)}" width="200" height="60" alt="Powerplay Customs" style="width:200px;height:60px;margin:0 auto;border:0;display:block;"></a></td></tr>
${hero}
${o.body}
<tr><td class="pad" style="background:#ffffff;border-top:1px solid #e6e6e6;border-radius:0 0 12px 12px;padding:20px 40px 24px;">
${o.footerLine ?? DEFAULT_FOOTER_LINE}
</td></tr>
<tr><td class="pad" align="center" style="padding:20px 40px 0;">
<p style="margin:0 0 4px;${MAIL_FF}font-size:12px;line-height:18px;color:#8a8a8a;">Powerplay Customs &middot; Calgary, Alberta &middot; <a href="${SITE_URL}" style="color:#8a8a8a;">powerplaycustoms.ca</a></p>
<p style="margin:0;${MAIL_FF}font-size:12px;line-height:18px;color:#8a8a8a;">${esc(o.footerNote ?? "If this wasn't meant for you, ignore this email.")}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
