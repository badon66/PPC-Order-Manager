'use server';

import { revalidatePath } from 'next/cache';
import { repo } from '@/lib/data';
import { logEntry } from '@/lib/data/logic';
import { currentActor, requireRole } from '@/lib/auth';
import { today } from '@/lib/dates';
import { FACTORY_ACTIONS, FACTORY_STEP_LABEL, factoryStateOf, orderPatchOnApproval } from '@/lib/factory/steps';
import { loadFactoryBalance } from '@/lib/factory/balance';
import { allocatePayment, parseMoney, usd } from '@/lib/factory/money';

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

/**
 * "I sent money" — Keenan paid the factory. USD.
 *
 * `paymentId` is made in the browser when the form opens, and a payment with
 * that id is recorded once: a double press, a retry after a slow response or
 * a re-sent request can't pay twice. A job named → all of it on that job;
 * none → what's due first, oldest job first (`allocatePayment`). The factory
 * sees it in "What's new" and its balance drops.
 */
export async function recordFactoryPayment(
  paymentId: string,
  amountRaw: string,
  orderIdRaw: string,
  noteRaw = '',
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  await requireRole('staff');
  const actor = await currentActor();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(String(paymentId ?? ''))) return { ok: false, error: 'Reload the page and try again.' };
  const cents = parseMoney(amountRaw);
  if (cents === null || cents <= 0) return { ok: false, error: 'Enter the amount in US dollars, like 1500 or 1500.50.' };
  const note = String(noteRaw ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);

  const already = await repo.historyByActions(null, ['factory_payment']);
  if (already.some((h) => h.field === paymentId)) return { ok: true, summary: 'Already recorded.' };

  const { rows } = await loadFactoryBalance();
  const plan = allocatePayment(
    rows.map((r) => ({ orderId: r.order.id, sentAt: r.card.sentAt ?? '', balance: r.card.money.balance, dueNow: r.card.money.dueNow })),
    cents,
    String(orderIdRaw ?? '').trim() || null,
  );
  if (!plan.ok) return plan;

  const name = (id: string) => rows.find((r) => r.order.id === id)?.order.teamName || 'a job';
  await repo.appendLog(
    plan.parts.map((p) =>
      logEntry({
        orderId: p.orderId,
        action: 'factory_payment',
        field: paymentId,
        // The note is shown to the factory beside the payment.
        fromValue: note,
        toValue: String(p.cents),
        summary: `Sent the factory ${usd(p.cents)} USD${plan.parts.length > 1 ? ` (part of ${usd(cents)})` : ''}${note ? ` — ${note}` : ''}`,
        actorEmail: actor.email,
        actorName: actor.name,
      }),
    ),
  );
  for (const p of plan.parts) refresh(p.orderId);
  revalidatePath('/balance');
  return { ok: true, summary: `Recorded ${usd(cents)} USD: ${plan.parts.map((p) => `${usd(p.cents)} on ${name(p.orderId)}`).join(', ')}.` };
}

/** Take a payment back off (entered by mistake). Every job it was split across; the factory is told. */
export async function voidFactoryPayment(paymentId: string): Promise<Result> {
  await requireRole('staff');
  const actor = await currentActor();
  const log = await repo.historyByActions(null, ['factory_payment', 'factory_payment_void']);
  const parts = log.filter((h) => h.action === 'factory_payment' && h.field === paymentId);
  if (parts.length === 0) return { ok: false, error: 'That payment was not found. Reload the page.' };
  if (log.some((h) => h.action === 'factory_payment_void' && h.field === paymentId)) return { ok: true };
  await repo.appendLog(
    parts.map((h) =>
      logEntry({
        orderId: h.orderId,
        action: 'factory_payment_void',
        field: paymentId,
        toValue: h.toValue,
        summary: `Removed the ${usd(Number(h.toValue ?? 0))} USD payment to the factory (entered by mistake)`,
        actorEmail: actor.email,
        actorName: actor.name,
      }),
    ),
  );
  for (const h of parts) refresh(h.orderId);
  revalidatePath('/balance');
  return { ok: true };
}
