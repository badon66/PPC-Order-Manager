'use server';

import { revalidatePath } from 'next/cache';
import { repo } from '@/lib/data';
import { currentActor, requireRole } from '@/lib/auth';
import { newToken } from '@/lib/order-utils';

/**
 * Make (or remake) the factory link for an order.
 *
 * New orders get a factory token at birth (blankOrder). Orders from before
 * the factory sheet existed have none, because a heal can't mint one — it
 * runs on every read and isn't written back, so the link would change on
 * every page load. This is the one place a token is minted after the fact.
 *
 * `rotate` replaces an existing token, which kills every copy of the old link
 * — the move when a link has gone somewhere it shouldn't. The factory code
 * still stands in front of the new one.
 */
export async function createFactoryLink(orderId: string, rotate = false): Promise<{ ok: boolean; error?: string }> {
  await requireRole('staff');
  const actor = await currentActor();
  const bundle = await repo.getOrder(orderId);
  if (!bundle) return { ok: false, error: 'Order not found' };
  if (bundle.order.factoryToken && !rotate) return { ok: true };

  await repo.updateOrder(orderId, { factoryToken: newToken() }, actor);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}
