import type { IntakeInput } from '@/lib/data/intake-logic';
import { composeEnquiryMail } from '@/lib/data/intake-mail';
import { mailConfigured, sendMail } from '@/lib/mail';

/**
 * Send the team their confirmation, best effort.
 *
 * By the time this runs the Draft is saved and the website page has moved on
 * to its thank-you screen, so nothing here may throw: a mailbox outage is a
 * log line, not a failed enquiry. Keenan's own Shopify email arrives either
 * way, and the page still shows the team their link.
 */
export async function confirmEnquiry(input: IntakeInput, rosterUrl: string, created: boolean): Promise<void> {
  if (!mailConfigured()) {
    console.warn('[intake] confirmation email not sent: SMTP_USER / SMTP_PASS are not set');
    return;
  }
  const mail = composeEnquiryMail({
    customerName: input.customerName,
    teamName: input.teamName,
    startingPoint: input.startingPoint,
    rosterUrl,
    created,
  });
  const result = await sendMail({ to: input.email, ...mail });
  if (result.sent) console.log(`[intake] confirmation email sent to ${input.email} (${result.id})`);
  else console.error(`[intake] confirmation email NOT sent to ${input.email}: ${result.reason}`);
}
