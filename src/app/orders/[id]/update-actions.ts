'use server';

import { revalidatePath } from 'next/cache';
import { currentActor, requireRole } from '@/lib/auth';
import { sendCustomerUpdate } from '@/lib/customer-updates';
import { MOCKUP_VERSIONS, PAYMENT_KINDS, UPDATE_STAGES, type MockupVersion, type PaymentKind, type UpdateStage } from '@/lib/types';

export async function sendUpdateAction(
  orderId: string,
  stage: UpdateStage,
  input: { amount?: string; howToPay?: string; force?: boolean; paymentKind?: PaymentKind; alreadyPaid?: boolean; mockupVersion?: MockupVersion },
): Promise<{ ok: boolean; error?: string; note?: string }> {
  await requireRole('staff');
  const actor = await currentActor();
  try {
    if (!(UPDATE_STAGES as readonly string[]).includes(stage)) return { ok: false, error: 'Unknown email' };
    if (input.paymentKind !== undefined && !(PAYMENT_KINDS as readonly string[]).includes(input.paymentKind)) {
      return { ok: false, error: 'Unknown payment kind' };
    }
    if (input.mockupVersion !== undefined && !(MOCKUP_VERSIONS as readonly string[]).includes(input.mockupVersion)) {
      return { ok: false, error: 'Unknown mockup version' };
    }
    const r = await sendCustomerUpdate(orderId, stage, { ...input, alreadyPaid: input.alreadyPaid === true }, actor);
    revalidatePath(`/orders/${orderId}`);
    revalidatePath(`/orders/${orderId}/history`);
    return r.sent ? { ok: true, note: r.note } : { ok: false, error: r.reason };
  } catch (e) {
    console.error(`[updates] sendUpdateAction failed for ${orderId}/${stage}: ${(e as Error).message}`);
    return { ok: false, error: (e as Error).message };
  }
}
