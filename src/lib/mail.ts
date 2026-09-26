import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Outbound email, over SMTP.
 *
 * SMTP rather than a mail API on purpose: the business mailbox is Google
 * Workspace (info@powerplaycustoms.ca), so sending through it needs no DNS
 * work and every message lands in the mailbox's own Sent folder, where a
 * reply threads naturally. Any other SMTP provider drops in by changing the
 * host — nothing here is Gmail-specific.
 *
 * Off until SMTP_USER and SMTP_PASS are set. Callers get { sent: false } and
 * carry on; nothing that sends mail is allowed to fail because of it.
 *
 * SMTP_PASS is an app password, never the mailbox password, and lives only in
 * the server's environment (Vercel project settings / .env.local).
 */

/** One file attached to an outbound email. */
export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  /** Referenced from the HTML body as `cid:<cid>`, for an inline image. */
  cid?: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}

export type SendResult = { sent: true; id: string } | { sent: false; reason: string };

/** How long a send may take before we give up and log it. Vercel functions are short-lived. */
const SEND_TIMEOUT_MS = 10_000;
/** A message with attachments (finished-jersey photos) takes longer to
 *  hand off to the SMTP server than a plain-text one — 10 s was tuned for
 *  the latter and clipped real sends of the former. */
const SEND_TIMEOUT_WITH_ATTACHMENTS_MS = 30_000;

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let cached: Transporter | null = null;

function port(): number {
  return Number(process.env.SMTP_PORT || 465);
}

function host(): string {
  return process.env.SMTP_HOST || 'smtp.gmail.com';
}

/**
 * A credential as the server should receive it. Vercel stores whatever was
 * pasted, and the common paste mistakes are surrounding whitespace or quotes
 * and, for a Google app password, the spaces Google prints between the four
 * letter groups (Google ignores them on its own login page; SMTP does not).
 * Pure, so it can be tested without a mailbox. Returns what it changed so the
 * failure log can say so, without ever printing the value.
 */
export function cleanCredential(raw: string, smtpHost: string): { value: string; fixes: string[] } {
  const fixes: string[] = [];
  let v = raw;
  if (v !== v.trim()) { v = v.trim(); fixes.push('surrounding whitespace'); }
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1);
    fixes.push('quotes');
  }
  if (/(^|\.)(gmail|googlemail)\.com$/i.test(smtpHost) && /\s/.test(v)) { v = v.replace(/\s+/g, ''); fixes.push('inner spaces'); }
  return { value: v, fixes };
}

/** What the failure log may say about the password: its shape, never its value. */
function passwordShape(): string {
  const raw = process.env.SMTP_PASS ?? '';
  const { value, fixes } = cleanCredential(raw, host());
  const kind = /^[a-z]{16}$/.test(value) ? 'looks like a Google app password' : /^[a-z ]{19}$/.test(raw) ? 'app password with spaces' : `${value.length} chars`;
  return `SMTP_PASS ${kind}${fixes.length ? `, cleaned: ${fixes.join(', ')}` : ''}`;
}

function transporter(): Transporter {
  if (cached) return cached;
  const p = port();
  const h = host();
  cached = nodemailer.createTransport({
    host: h,
    port: p,
    // 465 is implicit TLS; 587 starts plain and upgrades. Either works with Google.
    secure: (process.env.SMTP_SECURE ?? (p === 465 ? 'true' : 'false')) === 'true',
    auth: { user: cleanCredential(process.env.SMTP_USER!, h).value, pass: cleanCredential(process.env.SMTP_PASS!, h).value },
  });
  return cached;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function sendMail(m: MailMessage): Promise<SendResult> {
  if (!mailConfigured()) return { sent: false, reason: 'SMTP not configured' };
  const from = process.env.MAIL_FROM || `Powerplay Customs <${process.env.SMTP_USER}>`;
  const replyTo = m.replyTo || process.env.MAIL_REPLY_TO || 'info@powerplaycustoms.ca';
  // Optional copy to the business mailbox: when the mail leaves through a provider
  // rather than the mailbox itself, nothing lands in Sent, and this is the record.
  const bcc = process.env.MAIL_BCC || undefined;
  try {
    const info = await withTimeout(
      transporter().sendMail({ from, to: m.to, replyTo, bcc, subject: m.subject, text: m.text, html: m.html, attachments: m.attachments }),
      m.attachments?.length ? SEND_TIMEOUT_WITH_ATTACHMENTS_MS : SEND_TIMEOUT_MS,
    );
    return { sent: true, id: String(info.messageId ?? '') };
  } catch (e) {
    // Name the route that failed (never the password) so the log line answers
    // the first questions: which server, which login, and does the stored
    // password even have the right shape.
    return { sent: false, reason: `${(e as Error).message} (via ${host()}:${port()} as ${process.env.SMTP_USER}; ${passwordShape()})` };
  }
}
