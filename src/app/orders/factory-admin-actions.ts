'use server';

import { revalidatePath } from 'next/cache';
import { repo } from '@/lib/data';
import { logEntry } from '@/lib/data/logic';
import { currentActor, requireRole } from '@/lib/auth';
import { today } from '@/lib/dates';
import { FACTORY_ACTIONS, FACTORY_STEP_LABEL, factoryStateOf, orderPatchOnApproval } from '@/lib/factory/steps';

/**
 * Keenan's side of the factory's moves: approve or turn down a Completed /
 * Shipped request, and clear the factory's activity once he's read it.
 *
 * Approval is the only place a factory move changes the ORDER (status,
 * production-finished date, tracking number), and it goes through the normal
 * `updateOrder`, so it's logged like any other change of Keenan's.
 */

type Result = { ok: true; moved?: string } | { ok: false; error: string };

function refresh(orderId: string) {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/orders');
  revalidatePath('/queue');
  revalidatePath('/factory');
  revalidatePath(`/factory/jobs/${orderId}`);
}

export async function approveFactoryStep(orderId: string, requestId: string): Promise<Result> {
  await requireRole('staff');
  const actor = await currentActor();
  const order = await repo.getOrderRow(orderId);
  if (!order) return { ok: false, error: 'Order not found.' };

  const state = factoryStateOf(await repo.historyByActions([orderId], FACTORY_ACTIONS));
  // The request must still be the one waiting: approved twice, withdrawn, or replaced all stop here.
  if (!state.pending || state.pending.id !== requestId) {
    return { ok: false, error: 'That request is no longer waiting. Reload the page.' };
  }
  const pending = state.pending;

  // The order first, then the approval: if the order write fails, the request
  // is still waiting and Approve can simply be pressed again.
  const patch = orderPatchOnApproval(order, pending, today());
  if (Object.keys(patch).length > 0) await repo.updateOrder(orderId, patch, actor);
  await repo.appendLog([
    logEntry({
      orderId,
      action: 'factory_step_approved',
      field: pending.id,
      toValue: pending.step,
      summary: `Approved the factory's ${FACTORY_STEP_LABEL[pending.step]}`,
      actorEmail: actor.email,
      actorName: actor.name,
    }),
  ]);
  refresh(orderId);
  return { ok: true, moved: patch.status };
}

export async function declineFactoryStep(orderId: string, requestId: string, reasonRaw = ''): Promise<Result> {
  await requireRole('staff');
  const actor = await currentActor();
  const state = factoryStateOf(await repo.historyByActions([orderId], FACTORY_ACTIONS));
  if (!state.pending || state.pending.id !== requestId) {
    return { ok: false, error: 'That request is no longer waiting. Reload the page.' };
  }
  const reason = String(reasonRaw ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  await repo.appendLog([
    logEntry({
      orderId,
      action: 'factory_step_declined',
      field: state.pending.id,
      // The reason is shown to the factory in "What's new".
      fromValue: reason,
      toValue: state.pending.step,
      summary: `Did not approve the factory's ${FACTORY_STEP_LABEL[state.pending.step]}${reason ? `: ${reason}` : ''}`,
      actorEmail: actor.email,
      actorName: actor.name,
    }),
  ]);
  refresh(orderId);
  return { ok: true };
}

/** "Got it": the factory's activity on this order is read. A waiting request stays until answered. */
export async function ackFactoryActivity(orderId: string): Promise<Result> {
  await requireRole('staff');
  const actor = await currentActor();
  await repo.appendLog([
    logEntry({ orderId, action: 'factory_ack', summary: 'Read the factory activity', actorEmail: actor.email, actorName: actor.name }),
  ]);
  refresh(orderId);
  return { ok: true };
}
