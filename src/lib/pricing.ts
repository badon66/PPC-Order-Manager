import type { JerseyTier, Order, PantShellType, SockType } from './types';
import { computeTotals } from './order-utils';

/**
 * Pricing. KEENAN ONLY — see the money rule in CLAUDE.md.
 *
 * Source: Powerplay_Pricing_Reference.md, 2 October 2026. Change the numbers
 * here when the price list changes; nothing else in the app knows a price.
 *
 * Every order from Design Talk on is priced AUTOMATICALLY from what's on it:
 * tier × jersey count, socks, shells, the add-ons the order sheet already
 * records, the under-8 surcharge and the team bundle. `orderValue` on the
 * order is a manual OVERRIDE, null by default — set it and that number wins;
 * clear it and the list price comes back. Everything that shows a value
 * (board, card, money panel, order sheet) goes through `orderValueOf`, so
 * there is one answer.
 */

export const JERSEY_LIST_PRICE: Record<JerseyTier, number> = {
  lite: 75,
  premier: 95,
  reversible: 130, // reference flags this as unsettled: quoted at 120 twice
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

/** Stitched twill logos and numbers on a sublimated body. */
export const STITCHED_ON_SUBLIMATED_PER_JERSEY = 20;
/** Rounded shoulders on Elite. (Included on every other build.) */
export const ROUNDED_SHOULDERS_ON_ELITE = 4;
/** One set = 1 C + 3 A, stitched. Priced per set the order needs. */
export const CAPTAIN_SET_PRICE = 20;
export const CAPTAIN_SET_C = 1;
export const CAPTAIN_SET_A = 3;
/** Jerseys + socks + shells for the same squad. */
export const BUNDLE_SAVING_PER_PLAYER = 35;
export const BUNDLE_MIN_PLAYERS = 16;
/** Below this many jerseys every jersey is +50% and shipping isn't free. */
export const SMALL_ORDER_THRESHOLD = 8;
export const SMALL_ORDER_MULTIPLIER = 1.5;

export interface PriceLine {
  label: string;
  qty: number;
  unit: number;
  amount: number;
}

export interface Pricing {
  lines: PriceLine[];
  /** Sum of the lines, CAD before tax. */
  total: number;
  /** What this can't know about, in plain words. */
  caveats: string[];
}

type Priceable = Pick<
  Order,
  | 'jerseyTier' | 'jerseyType' | 'sockType' | 'pantShellType' | 'sets' | 'orderMode'
  | 'stitchedSublimatedLogos' | 'shoulderCut' | 'hasCaptainPatches' | 'captainCQuantity' | 'captainAQuantity'
>;

/** List price for the order as it stands. null when there's no tier to price from. */
export function listPrice(order: Priceable): Pricing | null {
  if (!order.jerseyTier) return null;
  const t = computeTotals(order, []);
  const lines: PriceLine[] = [];
  const caveats: string[] = [];
  const jerseys = t.totalJerseys;
  const players = order.sets.reduce((m, s) => Math.max(m, (s.playerJerseys || 0) + (s.goalieJerseys || 0)), 0);

  let jerseyUnit = JERSEY_LIST_PRICE[order.jerseyTier];
  if (jerseys > 0 && jerseys < SMALL_ORDER_THRESHOLD) {
    jerseyUnit = Math.round(jerseyUnit * SMALL_ORDER_MULTIPLIER);
    caveats.push(`Under ${SMALL_ORDER_THRESHOLD} jerseys: +50% each, and shipping isn't free.`);
  }
  if (jerseys > 0) {
    lines.push({ label: `${tierLabel(order.jerseyTier)} jerseys`, qty: jerseys, unit: jerseyUnit, amount: jerseys * jerseyUnit });
  }

  if (jerseys > 0 && order.stitchedSublimatedLogos && order.jerseyType !== 'embroidered') {
    lines.push({ label: 'Stitched twill logos (sublimated body)', qty: jerseys, unit: STITCHED_ON_SUBLIMATED_PER_JERSEY, amount: jerseys * STITCHED_ON_SUBLIMATED_PER_JERSEY });
  }
  if (jerseys > 0 && order.jerseyTier === 'elite' && order.shoulderCut === 'rounded') {
    lines.push({ label: 'Rounded shoulders on Elite', qty: jerseys, unit: ROUNDED_SHOULDERS_ON_ELITE, amount: jerseys * ROUNDED_SHOULDERS_ON_ELITE });
  }
  if (order.hasCaptainPatches && (order.captainCQuantity || order.captainAQuantity)) {
    const sets = Math.max(
      Math.ceil((order.captainCQuantity || 0) / CAPTAIN_SET_C),
      Math.ceil((order.captainAQuantity || 0) / CAPTAIN_SET_A),
    );
    if (sets > 0) lines.push({ label: "C's and A's, stitched (1 C + 3 A per set)", qty: sets, unit: CAPTAIN_SET_PRICE, amount: sets * CAPTAIN_SET_PRICE });
  }

  const socks = t.totalSockPairs;
  if (socks > 0 && order.sockType) {
    const unit = SOCK_LIST_PRICE[order.sockType];
    lines.push({ label: 'Socks', qty: socks, unit, amount: socks * unit });
  }
  const shells = t.totalPantShells;
  if (shells > 0 && order.pantShellType) {
    const unit = SHELL_LIST_PRICE[order.pantShellType];
    lines.push({ label: 'Pant shells', qty: shells, unit, amount: shells * unit });
  }

  if (jerseys > 0 && socks > 0 && shells > 0 && players >= BUNDLE_MIN_PLAYERS) {
    lines.push({ label: 'Team bundle (jerseys + socks + shells)', qty: players, unit: -BUNDLE_SAVING_PER_PLAYER, amount: -players * BUNDLE_SAVING_PER_PLAYER });
  }

  if (order.jerseyTier === 'reversible') caveats.push('Reversible has been quoted at both $120 and $130; this uses $130.');
  caveats.push('Before GST and card fees. Sponsorship upgrades, vectorizing, extra graphics and samples are not included.');

  return { lines, total: lines.reduce((n, l) => n + l.amount, 0), caveats };
}

/**
 * The one number everything shows. Override if Keenan set one, list price if
 * not, null if there's nothing to price from.
 */
export function orderValueOf(order: Priceable & Pick<Order, 'orderValue'>): number | null {
  if (order.orderValue !== null && order.orderValue !== undefined) return order.orderValue;
  return listPrice(order)?.total ?? null;
}

export function isOverridden(order: Pick<Order, 'orderValue'>): boolean {
  return order.orderValue !== null && order.orderValue !== undefined;
}

function tierLabel(t: JerseyTier): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** $1,234 — whole dollars. */
export function formatCad(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-CA');
}
