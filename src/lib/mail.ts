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

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export type SendResult = { sent: true; id: string } | { sent: false; reason: string };

/** How long a send may take before we give up and log it. Vercel functions are short-lived. */
const SEND_TIMEOUT_MS = 10_000;

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let cached: Transporter | null = null;

function transporter(): Transporter {
  if (cached) return cached;
  const port = Number(process.env.SMTP_PORT || 465);
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    // 465 is implicit TLS; 587 starts plain and upgrades. Either works with Google.
    secure: (process.env.SMTP_SECURE ?? (port === 465 ? 'true' : 'false')) === 'true',
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
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
  try {
    const info = await withTimeout(
      transporter().sendMail({ from, to: m.to, replyTo, subject: m.subject, text: m.text, html: m.html }),
      SEND_TIMEOUT_MS,
    );
    return { sent: true, id: String(info.messageId ?? '') };
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}
