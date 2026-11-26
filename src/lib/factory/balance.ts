import { repo } from '@/lib/data';
import { orderValueOf } from '@/lib/pricing';
import { today } from '@/lib/dates';
import type { AppSettings, Order } from '@/lib/types';
import { jobCardOf, type FactoryJobCard } from './board';
import { FEED_ACTIONS } from './changes';
import { balanceTotals, costCheck, expectedCostOf, profitOf, type BalanceTotals, type CostCheck } from './money';
import { FACTORY_ACTIONS, isFactoryJob } from './steps';

/**
 * KEENAN'S side of the factory balance. SERVER ONLY, ADMIN PAGES ONLY.
 *
 * This is the one place the factory's cost meets the customer's price (the
 * cost check and the profit). Nothing under src/app/factory or
 * src/app/api/factory may import it — tests/factory/money.test.ts checks.
 */

export interface BalanceRow {
  order: Pick<Order, 'id' | 'teamName' | 'invoiceNumber' | 'status' | 'sentToFactoryAt'>;
  card: FactoryJobCard;
  check: CostCheck;
  /** CAD cents; null without a price, a cost, or an exchange rate. */
  profit: number | null;
}

export function balanceRowOf(order: Order, card: FactoryJobCard, settings: AppSettings): BalanceRow {
  const expected = expectedCostOf(order, settings.factoryRates);
  return {
    order: { id: order.id, teamName: order.teamName, invoiceNumber: order.invoiceNumber, status: order.status, sentToFactoryAt: order.sentToFactoryAt },
    card,
    check: card.money.cost === null ? { kind: 'none' } : costCheck(card.money.cost, expected, Math.round(settings.factoryFlagAt * 100)),
    profit: profitOf(orderValueOf(order), card.money.total, settings.usdToCad),
  };
}

export async function loadFactoryBalance(): Promise<{ rows: BalanceRow[]; totals: BalanceTotals; settings: AppSettings; today: string }> {
  const [all, settings] = await Promise.all([repo.listOrders({ status: 'all', includeCompleted: true }), repo.getSettings()]);
  const orders = all.filter(isFactoryJob);
  const [rosters, history] = await Promise.all([
    repo.rostersForOrders(orders),
    repo.historyByActions(orders.map((o) => o.id), [...FACTORY_ACTIONS, ...FEED_ACTIONS]),
  ]);
  const rows = orders
    .map((o) => balanceRowOf(o, jobCardOf(o, rosters[o.id] ?? [], history), settings))
    // Oldest job first: the order payments are applied in.
    .sort((a, b) => (a.card.sentAt ?? '9999').localeCompare(b.card.sentAt ?? '9999') || a.order.id.localeCompare(b.order.id));
  return { rows, totals: balanceTotals(rows.map((r) => r.card.money)), settings, today: today() };
}
