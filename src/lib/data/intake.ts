import type { Order } from '@/lib/types';
import type { Repository } from './repository';
import { draftPatch, enquiryOf, findDuplicate, INTAKE_ACTOR, sectionsForRoute, type IntakeInput } from './intake-logic';

export type IntakeRepo = Pick<Repository, 'listOrders' | 'createOrder' | 'updateOrder' | 'getByRosterToken'>;

export class TokenTakenError extends Error {
  constructor() {
    super('That roster token already belongs to another order.');
  }
}

/**
 * Create-or-update for a website enquiry. The one place that decides which.
 *
 * The token comes from the page (it needs it in the email before we've
 * answered), so the only check here is that nobody else already holds it.
 */
export async function intakeOrder(
  input: IntakeInput,
  repo: IntakeRepo,
  now = new Date(),
): Promise<{ order: Order; created: boolean }> {
  const receivedAt = now.toISOString();
  const dup = findDuplicate(await repo.listOrders({ status: 'draft' }), input, now.getTime());

  const holder = await repo.getByRosterToken(input.rosterToken);
  if (holder && (!dup || dup.rosterToken !== input.rosterToken)) throw new TokenTakenError();

  if (dup) {
    const order = await repo.updateOrder(
      dup.id,
      // The route may have changed between the two enquiries, so the page's sections follow it.
      { enquiry: enquiryOf(input, receivedAt), rosterToken: input.rosterToken, clientLinkSections: sectionsForRoute(input.startingPoint) },
      INTAKE_ACTOR,
    );
    return { order, created: false };
  }
  const order = await repo.createOrder(draftPatch(input, receivedAt), INTAKE_ACTOR);
  return { order, created: true };
}
