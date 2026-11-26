import { repo } from '@/lib/data';
import { factoryViewOf } from '@/lib/data/logic';
import { pageNotesOf, NOTE_ACTIONS } from '@/lib/page-notes';
import { today } from '@/lib/dates';
import { jobCardOf, sortCards, type FactoryJobCard } from './board';
import { FEED_ACTIONS } from './changes';
import { FACTORY_ACTIONS, isFactoryJob } from './steps';

/**
 * What the factory's pages read. SERVER ONLY.
 *
 * Two rules, both enforced here so no page can forget them:
 *   - only orders that pass `isFactoryJob` are ever loaded for the factory;
 *   - what leaves is a `FactoryJobCard` or a `FactoryOrderView` — both built
 *     field by field, neither carrying a price.
 */

const BOARD_ACTIONS = [...FACTORY_ACTIONS, ...FEED_ACTIONS] as const;

export async function loadFactoryBoard(): Promise<{ cards: FactoryJobCard[]; today: string }> {
  const now = today();
  const orders = (await repo.listOrders({ status: 'all', includeCompleted: true })).filter(isFactoryJob);
  const [rosters, history] = await Promise.all([
    repo.rostersForOrders(orders),
    repo.historyByActions(orders.map((o) => o.id), BOARD_ACTIONS),
  ]);
  const cards = orders.map((o) => jobCardOf(o, rosters[o.id] ?? [], history));
  return { cards: sortCards(cards, now), today: now };
}

export async function loadFactoryJob(id: string) {
  const bundle = await repo.getOrder(id);
  // Not a job the factory may see (a draft, a design in progress, deleted,
  // or no such order): exactly the same answer for all of them.
  if (!bundle || !isFactoryJob(bundle.order)) return null;
  const history = await repo.historyByActions([id], [...BOARD_ACTIONS, ...NOTE_ACTIONS]);
  return {
    id,
    view: factoryViewOf(bundle.order, bundle.roster, bundle.assets),
    card: jobCardOf(bundle.order, bundle.roster, history),
    notes: pageNotesOf(history).filter((n) => n.from === 'factory'),
    today: today(),
  };
}
