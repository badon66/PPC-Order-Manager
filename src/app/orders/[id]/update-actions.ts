'use server';

import { revalidatePath } from 'next/cache';
import { currentActor, requireRole } from '@/lib/auth';
import { sendCustomerUpdate } from '@/lib/customer-updates';
import { UPDATE_STAGES, type UpdateStage } from '@/lib/types';

export async function sendUpdateAction(
  orderId: string,
  stage: UpdateStage,
  input: { amount?: string; howToPay?: string; force?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  await requireRole('staff');
  const actor = await currentActor();
  if (!(UPDATE_STAGES as readonly string[]).includes(stage)) return { ok: false, error: 'Unknown email' };
  const r = await sendCustomerUpdate(orderId, stage, input, actor);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}/history`);
  return r.sent ? { ok: true } : { ok: false, error: r.reason };
}
