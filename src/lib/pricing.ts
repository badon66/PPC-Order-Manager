import type { JerseyTier, Order, PantShellType, SockType } from './types';
import { buildsDiffer, captainCounts, computeTotals, perSetShellTypes, perSetSockTypes, setBuilds } from './order-utils';

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
  // Hybrid = Premier + stitched-on logos. The logos are priced by their own
  // line below ($20 a jersey, as on any sublimated build), so the jersey
  // itself is Premier's price: $115 all in.
  hybrid: 95,
  reversible: 130, // reference flags this as unsettled: quoted at 120 twice
  elite: 120,
  pro: 140,
};

export const SOCK_LIST_PRICE: Record<Exclude<SockType, null>, number> = {
  sublimated: 30,
  reversible_sublimated: 30,
  embroidered: 35,
};
/** "Socks, pro cut" in the reference: multi-panel construction, $5 more a pair on either build. */
export const MULTI_PANEL_SOCK_EXTRA = 5;

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
  | 'captainAwayCQuantity' | 'captainAwayAQuantity'
  | 'multiPanelSocks'
>;

/** List price for the order as it stands. null when there's no tier to price from. */
export function listPrice(order: Priceable): Pricing | null {
  if (!order.jerseyTier) return null;
  const t = computeTotals(order, []);
  const lines: PriceLine[] = [];
  const caveats: string[] = [];
  const jerseys = t.totalJerseys;
  const players = order.sets.reduce((m, s) => Math.max(m, (s.playerJerseys || 0) + (s.goalieJerseys || 0)), 0);

  const small = jerseys > 0 && jerseys < SMALL_ORDER_THRESHOLD;
  if (small) caveats.push(`Under ${SMALL_ORDER_THRESHOLD} jerseys: +50% each, and shipping isn't free.`);
  const unitOf = (tier: JerseyTier) =>
    small ? Math.round(JERSEY_LIST_PRICE[tier] * SMALL_ORDER_MULTIPLIER) : JERSEY_LIST_PRICE[tier];

  /*
   * One build, one line, as always. Sets built differently (home embroidered,
   * away sublimated) are priced set by set at each set's own tier.
   */
  const builds = setBuilds(order);
  const perSet = order.sets.map((s, i) => ({
    build: builds[i],
    jerseys: (s.playerJerseys || 0) + (s.goalieJerseys || 0) + (s.extraJerseys || 0),
  }));
  const differ = buildsDiffer(order) && perSet.reduce((n, p) => n + p.jerseys, 0) === jerseys;
  const groups = differ
    ? perSet.filter((p) => p.jerseys > 0)
    : [{ build: { label: '', jerseyType: order.jerseyType, jerseyTier: order.jerseyTier, addons: { stitchedSublimatedLogos: Boolean(order.stitchedSublimatedLogos) } }, jerseys }];

  for (const g of groups) {
    if (g.jerseys <= 0) continue;
    const tier = g.build.jerseyTier;
    if (!tier) {
      caveats.push(`${g.build.label || 'A set'} has no build tier yet, so its ${g.jerseys} jerseys aren't priced.`);
      continue;
    }
    const unit = unitOf(tier);
    const label = differ ? `${tierLabel(tier)} jerseys (${g.build.label})` : `${tierLabel(tier)} jerseys`;
    lines.push({ label, qty: g.jerseys, unit, amount: g.jerseys * unit });
  }

  // Each set's own stitched-on logos when the sets are built differently.
  const sublimatedJerseys = groups
    .filter((g) => g.build.jerseyType !== 'embroidered' && g.build.addons.stitchedSublimatedLogos)
    .reduce((n, g) => n + g.jerseys, 0);
  if (sublimatedJerseys > 0) {
    lines.push({ label: 'Stitched twill logos (sublimated body)', qty: sublimatedJerseys, unit: STITCHED_ON_SUBLIMATED_PER_JERSEY, amount: sublimatedJerseys * STITCHED_ON_SUBLIMATED_PER_JERSEY });
  }
  const eliteJerseys = groups.filter((g) => g.build.jerseyTier === 'elite').reduce((n, g) => n + g.jerseys, 0);
  if (eliteJerseys > 0 && order.shoulderCut === 'rounded') {
    lines.push({ label: 'Rounded shoulders on Elite', qty: eliteJerseys, unit: ROUNDED_SHOULDERS_ON_ELITE, amount: eliteJerseys * ROUNDED_SHOULDERS_ON_ELITE });
  }
  if (order.hasCaptainPatches) {
    // Home and away are separate designs, so each is counted in its own sets.
    const sets = captainCounts(order).reduce(
      (n, k) => n + Math.max(Math.ceil(k.c / CAPTAIN_SET_C), Math.ceil(k.a / CAPTAIN_SET_A)),
      0,
    );
    if (sets > 0) lines.push({ label: "C's and A's, stitched (1 C + 3 A per set)", qty: sets, unit: CAPTAIN_SET_PRICE, amount: sets * CAPTAIN_SET_PRICE });
  }

  /*
   * Socks and shells: one line at the order's type, or — when the sets are
   * different builds with socks (shells) on more than one — a line per type,
   * each set's pairs at its own type.
   */
  const socks = t.totalSockPairs;
  const sockGroups: Array<{ type: SockType | null; qty: number }> = perSetSockTypes(order)
    ? builds.filter((b) => b.socks > 0).map((b) => ({ type: b.sockType, qty: b.socks }))
    : [{ type: order.sockType, qty: socks }];
  const sockTypesUsed = new Set(sockGroups.map((g) => g.type));
  for (const type of sockTypesUsed) {
    const qty = sockGroups.filter((g) => g.type === type).reduce((n, g) => n + g.qty, 0);
    if (qty <= 0 || !type) continue;
    const unit = SOCK_LIST_PRICE[type] + (order.multiPanelSocks ? MULTI_PANEL_SOCK_EXTRA : 0);
    const base = order.multiPanelSocks ? 'Socks, pro cut multi-panel' : 'Socks';
    lines.push({ label: sockTypesUsed.size > 1 ? `${base} (${type})` : base, qty, unit, amount: qty * unit });
  }
  const shells = t.totalPantShells;
  const shellGroups: Array<{ type: PantShellType | null; qty: number }> = perSetShellTypes(order)
    ? builds.filter((b) => b.shells > 0).map((b) => ({ type: b.pantShellType, qty: b.shells }))
    : [{ type: order.pantShellType, qty: shells }];
  const shellTypesUsed = new Set(shellGroups.map((g) => g.type));
  for (const type of shellTypesUsed) {
    const qty = shellGroups.filter((g) => g.type === type).reduce((n, g) => n + g.qty, 0);
    if (qty <= 0 || !type) continue;
    const unit = SHELL_LIST_PRICE[type];
    lines.push({ label: shellTypesUsed.size > 1 ? `Pant shells (${type})` : 'Pant shells', qty, unit, amount: qty * unit });
  }

  if (jerseys > 0 && socks > 0 && shells > 0 && players >= BUNDLE_MIN_PLAYERS) {
    lines.push({ label: 'Team bundle (jerseys + socks + shells)', qty: players, unit: -BUNDLE_SAVING_PER_PLAYER, amount: -players * BUNDLE_SAVING_PER_PLAYER });
  }

  if (groups.some((g) => g.build.jerseyTier === 'reversible')) caveats.push('Reversible has been quoted at both $120 and $130; this uses $130.');
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
