'use server';

import { revalidatePath } from 'next/cache';
import { repo } from '@/lib/data';
import { currentActor, requireRole } from '@/lib/auth';
import { MANUAL_MESSAGE_ID, recipientOf } from '@/lib/data/customer-updates-logic';
import { UPDATE_STAGES, UPDATE_STAGE_LABEL, type UpdateStage } from '@/lib/types';

/**
 * "Already sent": Keenan told the team some other way (a text, a call, an
 * email from his own inbox) and doesn't want to be asked again.
 *
 * Recorded through the same `recordCustomerEmail` the real send uses, with
 * `messageId: MANUAL_MESSAGE_ID`. `dueUpdates` reads that list to decide what's still
 * owed, so nothing else needs to know this happened, and the history line
 * lands the same way a sent email's does.
 */
export async function markUpdateSentAction(orderId: string, stage: UpdateStage): Promise<{ ok: boolean; error?: string }> {
  await requireRole('staff');
  const actor = await currentActor();
  if (!(UPDATE_STAGES as readonly string[]).includes(stage)) return { ok: false, error: 'Unknown email' };
  const bundle = await repo.getOrder(orderId);
  if (!bundle) return { ok: false, error: 'Order not found' };
  const { order } = bundle;
  if (order.customerEmails.some((e) => e.stage === stage)) return { ok: true };

  await repo.recordCustomerEmail(
    orderId,
    {
      stage,
      sentAt: new Date().toISOString(),
      to: recipientOf(order) || 'by hand',
      messageId: MANUAL_MESSAGE_ID,
      detail: `${UPDATE_STAGE_LABEL[stage]} — marked as already sent`,
    },
    actor,
  );
  revalidatePath('/orders');
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}
