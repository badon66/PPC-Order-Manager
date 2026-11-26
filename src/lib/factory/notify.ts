import { CONTACT_EMAIL } from '@/lib/constants';
import { sendMail } from '@/lib/mail';
import { baseUrl } from '@/lib/base-url';
import { esc } from '@/lib/data/mail-layout';

/**
 * "Michael moved Riverbend Rockets to Sewing" — to Keenan, every time the
 * factory moves a job (2026-11-25). Same address as the sheet notes
 * (NOTES_EMAIL, else the business inbox). Best effort: it logs and never
 * throws; the move itself is already saved before this runs.
 */
export async function notifyFactoryMove(
  orderId: string,
  teamName: string,
  line: string,
  needsApproval: boolean,
): Promise<void> {
  try {
    const to = process.env.NOTES_EMAIL?.trim() || CONTACT_EMAIL;
    const link = `${await baseUrl()}/orders/${orderId}#factory`;
    const subject = needsApproval
      ? `Approve: ${teamName || 'an order'} — ${line}`
      : `Factory update: ${teamName || 'an order'} — ${line}`;
    const ask = needsApproval ? 'This one needs your approval before the order moves.' : '';
    const text = `${line}\n${ask}\n\nOpen the order: ${link}\n`;
    const html = `<p><b>${esc(teamName || 'An order')}</b>: ${esc(line)}</p>${ask ? `<p>${esc(ask)}</p>` : ''}<p><a href="${link}">Open the order</a></p>`;
    const r = await sendMail({ to, subject, text, html });
    if (!r.sent) console.log(`[factory] alert not sent for ${orderId}: ${r.reason}`);
  } catch (e) {
    console.error(`[factory] alert failed for ${orderId}: ${(e as Error).message}`);
  }
}
