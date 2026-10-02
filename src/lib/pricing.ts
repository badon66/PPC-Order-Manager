import type { JerseyTier, Order, RosterEntry, SockType, PantShellType } from './types';
import { computeTotals } from './order-utils';

/**
 * List prices, CAD before tax. KEENAN ONLY — see the money rule in CLAUDE.md.
 *
 * Source: Powerplay_Pricing_Reference.md, 2 October 2026. Change the numbers
 * here when the price list changes; nothing else in the app knows a price.
 *
 * `estimateOrderValue` is a STARTING POINT for the order-value field, not an
 * invoice: jerseys × tier price, socks, shells, the under-8 surcharge. It
 * knows nothing about bundles, sponsorship upgrades, stitched logos on a
 * sublimated body, vectorizing or samples. Keenan looks at it and types the
 * real number; the point is that he's correcting a figure, not starting from
 * zero.
 */

export const JERSEY_LIST_PRICE: Record<JerseyTier, number> = {
  lite: 75,
  premier: 95,
  reversible: 130, // the reference flags this as unsettled: quoted at 120 twice
  elite: 120,
  pro: 140,
};

export const SOCK_LIST_PRICE: Record<Exclude<SockType, null>, number> = {
  sublimated: 30,
  reversible_sublimated: 30,
  embroidered: 35,
};

export const SHELL_LIST_PRICE: Record<Exclude<PantShellType, null>, number> = {
  sublimated: 55,
  embroidered: 65,
};

/** Below this many jerseys every jersey is +50% and shipping isn't free. */
export const SMALL_ORDER_THRESHOLD = 8;
export const SMALL_ORDER_MULTIPLIER = 1.5;

export interface EstimateLine {
  label: string;
  qty: number;
  unit: number;
  amount: number;
}

export interface Estimate {
  lines: EstimateLine[];
  total: number;
  /** Why the number may be off, in Keenan's words. */
  caveats: string[];
}

export function estimateOrderValue(
  order: Pick<Order, 'jerseyTier' | 'sockType' | 'pantShellType' | 'sets' | 'orderMode'>,
  roster: RosterEntry[],
): Estimate | null {
  if (!order.jerseyTier) return null;
  const t = computeTotals(order, roster);
  const lines: EstimateLine[] = [];
  const caveats: string[] = [];

  let jerseyUnit = JERSEY_LIST_PRICE[order.jerseyTier];
  if (t.totalJerseys > 0 && t.totalJerseys < SMALL_ORDER_THRESHOLD) {
    jerseyUnit = Math.round(jerseyUnit * SMALL_ORDER_MULTIPLIER);
    caveats.push(`Under ${SMALL_ORDER_THRESHOLD} jerseys: +50% each, and shipping isn't free.`);
  }
  if (t.totalJerseys > 0) {
    lines.push({ label: `${tierLabel(order.jerseyTier)} jerseys`, qty: t.totalJerseys, unit: jerseyUnit, amount: t.totalJerseys * jerseyUnit });
  }
  if (t.totalSockPairs > 0 && order.sockType) {
    const unit = SOCK_LIST_PRICE[order.sockType];
    lines.push({ label: 'Socks', qty: t.totalSockPairs, unit, amount: t.totalSockPairs * unit });
  }
  if (t.totalPantShells > 0 && order.pantShellType) {
    const unit = SHELL_LIST_PRICE[order.pantShellType];
    lines.push({ label: 'Pant shells', qty: t.totalPantShells, unit, amount: t.totalPantShells * unit });
  }
  if (order.jerseyTier === 'reversible') caveats.push('Reversible has been quoted at both $120 and $130.');
  caveats.push('Before tax. No bundle discount, sponsorship upgrade, stitched logos, vectorizing or sample included.');

  return { lines, total: lines.reduce((n, l) => n + l.amount, 0), caveats };
}

function tierLabel(t: JerseyTier): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** $1,234 — whole dollars; the field is whole dollars too. */
export function formatCad(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return '$' + Math.round(n).toLocaleString('en-CA');
}
