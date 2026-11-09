import { CONTACT_EMAIL } from '@/lib/constants';
import { sendMail } from '@/lib/mail';
import { baseUrl } from '@/lib/base-url';
import { NOTE_FROM_LABEL, type PageNote } from '@/lib/page-notes';
import { esc } from '@/lib/data/mail-layout';

/**
 * "New note on Riverbend Rockets' order sheet" — to Keenan, whenever the team
 * or the factory pins one (2026-11-09). NOTES_EMAIL overrides where it goes;
 * otherwise the business inbox. Best effort like every other mail here: it
 * logs and never throws, so a mail outage never loses the note (that's
 * already saved before this runs).
 */
export async function notifyNewNote(orderId: string, teamName: string, note: PageNote): Promise<void> {
  try {
    const to = process.env.NOTES_EMAIL?.trim() || CONTACT_EMAIL;
    const link = `${await baseUrl()}/orders/${orderId}#sheet-notes`;
    const who = NOTE_FROM_LABEL[note.from];
    const sheet = note.from === 'team' ? 'order sheet' : 'production sheet';
    const where = [note.where.section, note.where.label].filter(Boolean).join(' › ') || 'the sheet';
    const quote = note.where.quote && note.where.quote !== note.where.label ? `On: “${note.where.quote}”\n` : '';
    const subject = `New note on ${teamName || 'an order'}'s ${sheet}`;
    const text = `${who} left a note on ${where}.\n\n${quote}“${note.text}”\n\nSee it on the order: ${link}\n`;
    const html = `<p>${esc(who)} left a note on <b>${esc(where)}</b>.</p>${
      quote ? `<p style="color:#666">On: “${esc(note.where.quote)}”</p>` : ''
    }<blockquote style="border-left:3px solid #f5b400;margin:0;padding:4px 12px">${esc(note.text)}</blockquote><p><a href="${link}">See it on the order</a></p>`;
    const r = await sendMail({ to, subject, text, html });
    if (!r.sent) console.log(`[notes] alert not sent for ${orderId}: ${r.reason}`);
  } catch (e) {
    console.error(`[notes] alert failed for ${orderId}: ${(e as Error).message}`);
  }
}
