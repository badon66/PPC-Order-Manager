import type { ExtraJersey, JerseyType, Order, OrderMode, RosterEntry, SetQuantities } from './types';
import { DEFAULT_CLIENT_LINK_SECTIONS } from './types';
import { LEAD_TIME_DAYS } from './constants';
import { addDays, type CalendarDate } from './dates';

/**
 * Web Crypto, not node:crypto.
 *
 * This module is imported by the roster editor, which is a client component —
 * a `node:crypto` import gets bundled into the browser and blows up the moment
 * you click "Add Player". `globalThis.crypto.randomUUID` exists in browsers and
 * in Node 19+, so both sides use the same call.
 */
function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

/* ------------------------------------------------------------------ *
 * Set scaffolding — which quantity blocks a given order mode renders.
 * ------------------------------------------------------------------ */

export function setsForMode(mode: OrderMode, numberOfSets = 1, existing: SetQuantities[] = []): SetQuantities[] {
  const blank = (label: string, i: number): SetQuantities => ({
    label,
    playerJerseys: existing[i]?.playerJerseys ?? 0,
    goalieJerseys: existing[i]?.goalieJerseys ?? 0,
    sockPairs: existing[i]?.sockPairs ?? 0,
    pantShells: existing[i]?.pantShells ?? 0,
    extraJerseys: existing[i]?.extraJerseys ?? 0,
    extraSockPairs: existing[i]?.extraSockPairs ?? 0,
    extraPantShells: existing[i]?.extraPantShells ?? 0,
    extrasNotes: existing[i]?.extrasNotes ?? '',
    notes: existing[i]?.notes ?? '',
  });

  if (mode === 'single_set') return [blank('Single Set', 0)];
  if (mode === 'home_away_set') return [blank('Home Set', 0), blank('Away Set', 1)];
  const n = Math.max(1, Math.min(numberOfSets || 1, 12));
  return Array.from({ length: n }, (_, i) => blank(`Set ${i + 1}`, i));
}

/* ------------------------------------------------------------------ *
 * Totals
 *
 * BUG THIS FIXES: the old app kept per-set totals on the Order AND per-player
 * counts on the roster with nothing reconciling them. Live data had an order
 * with 21 roster rows rendering as "Total Players 18" on the customer's page.
 *
 * Rule: the entered quantities ARE the order, and nothing else feeds the
 * totals. The roster is compared against them and any disagreement is
 * surfaced, but it never supplies a number — see the long note in
 * computeTotals for the bug that settled this.
 * ------------------------------------------------------------------ */

export interface OrderTotals {
  /** Summed from the manually-entered set quantity blocks. */
  declaredPlayerJerseys: number;
  declaredGoalieJerseys: number;
  declaredSockPairs: number;
  declaredPantShells: number;
  /** Roster-covered jerseys only: players + goalies. Extras are not in here. */
  declaredJerseys: number;

  /** Extras — produced on top of the roster. */
  extraJerseys: number;
  extraSockPairs: number;
  extraPantShells: number;

  /** Derived from roster rows. */
  rosterPlayerCount: number;
  rosterGoalieCount: number;
  rosterSockOnlyCount: number;
  rosterJerseys: number;
  rosterSockPairs: number;
  rosterPantShells: number;

  /**
   * What the UI shows, and what gets made: the declared quantities plus
   * extras. The roster never contributes — see computeTotals.
   */
  totalJerseys: number;
  totalSockPairs: number;
  totalPantShells: number;
  totalPlayers: number;

  hasRoster: boolean;
  /** True when the declared quantities and the roster disagree. */
  mismatch: boolean;
  mismatchDetail: string | null;
}

/**
 * Everything computeTotals actually reads off an order.
 *
 * Narrowed from `Order` on purpose: the customer's share page has a
 * `PublicOrderView`, not an Order, and before this it hand-rolled its own
 * arithmetic instead — which is how it ended up showing "Total Players: 0" for
 * an order with no roster yet, while the admin page showed the real number
 * from the same data. Two implementations of one rule, disagreeing.
 */
export type TotalsInput = Pick<Order, 'sets' | 'orderMode' | 'playersTotal'>;

export function computeTotals(order: TotalsInput, roster: RosterEntry[]): OrderTotals {
  const declaredPlayerJerseys = order.sets.reduce((n, s) => n + (s.playerJerseys || 0), 0);
  const declaredGoalieJerseys = order.sets.reduce((n, s) => n + (s.goalieJerseys || 0), 0);
  const declaredSockPairs = order.sets.reduce((n, s) => n + (s.sockPairs || 0), 0);
  const declaredPantShells = order.sets.reduce((n, s) => n + (s.pantShells || 0), 0);
  const declaredJerseys = declaredPlayerJerseys + declaredGoalieJerseys;

  const extraJerseys = order.sets.reduce((n, s) => n + (s.extraJerseys || 0), 0);
  const extraSockPairs = order.sets.reduce((n, s) => n + (s.extraSockPairs || 0), 0);
  const extraPantShells = order.sets.reduce((n, s) => n + (s.extraPantShells || 0), 0);

  const playing = roster.filter((r) => !r.sockOnly);
  const rosterGoalieCount = playing.filter((r) => r.isGoalie).length;
  const rosterPlayerCount = playing.length - rosterGoalieCount;
  const rosterSockOnlyCount = roster.filter((r) => r.sockOnly).length;

  /**
   * Where the per-player counts live depends on the order mode, matching how
   * the roster is actually filled in:
   *
   *  home/away  — four tick boxes per player (home jersey, away jersey, home
   *               socks, away socks), so the totals are counts of ticks.
   *  otherwise  — plain quantity fields per player.
   */
  const homeAway = order.orderMode === 'home_away_set';

  const rosterJerseys = homeAway
    ? playing.reduce((n, r) => n + (r.homeJersey || 0) + (r.awayJersey || 0), 0)
    : playing.reduce((n, r) => n + (r.jerseysPerPlayer || 0), 0);

  const rosterSockPairs = homeAway
    ? roster.reduce((n, r) => n + (r.homeSocks || 0) + (r.awaySocks || 0), 0)
    : roster.reduce((n, r) => n + (r.socksPerPlayer || 0), 0);
  const rosterPantShells = roster.reduce((n, r) => n + (r.shellsPerPlayer || 0), 0);

  const hasRoster = roster.length > 0;

  /*
   * TOTALS ARE WHAT KEENAN ENTERED. THE ROSTER IS NEVER A SOURCE.
   *
   * This is the third version of this rule and the reason it kept breaking is
   * that the earlier two both let the roster supply a number under some
   * condition. Every condition is a way to be wrong, so there is no longer a
   * condition: the quantities on the order are the order, and the roster is
   * only ever cross-checked against them.
   *
   * The bug that forced the rewrite: an order for 16 jerseys and NO socks
   * reported 16 pairs of socks. Two things met in the middle —
   *
   *   1. the previous rule read a declared 0 as "not filled in yet" and fell
   *      back to the roster, when 0 is a real answer meaning none; and
   *   2. every blank roster row defaulted to socksPerPlayer: 1, so 16 rows
   *      silently claimed 16 pairs of socks nobody had ordered.
   *
   * Either alone was survivable. Together they invented an entire line item on
   * a customer-facing page. Both are fixed — see blankRosterEntry for the
   * other half.
   *
   * A total of zero is now genuinely zero, and the UI drops zeros rather than
   * printing them (see Stat), so an order with no socks simply has no socks
   * anywhere on it.
   */
  const totalJerseys = declaredJerseys + extraJerseys;
  const totalSockPairs = declaredSockPairs + extraSockPairs;
  const totalPantShells = declaredPantShells + extraPantShells;
  const totalPlayers = order.playersTotal || 0;

  /*
   * The roster's only job here: say so when it disagrees.
   *
   * Not an error — a roster is normally part-finished, and the order is what
   * gets made either way. It's a prompt to look before production, and it
   * names both numbers so it's obvious which is which.
   */
  let mismatchDetail: string | null = null;
  if (hasRoster && declaredJerseys > 0 && declaredJerseys !== rosterJerseys) {
    mismatchDetail =
      `This order is for ${declaredJerseys} jerseys, but the roster accounts for ${rosterJerseys}. ` +
      `The order quantity is what's shown and what gets made — check the roster before production.`;
  }

  return {
    declaredPlayerJerseys, declaredGoalieJerseys, declaredSockPairs, declaredPantShells, declaredJerseys,
    extraJerseys, extraSockPairs, extraPantShells,
    rosterPlayerCount, rosterGoalieCount, rosterSockOnlyCount,
    rosterJerseys, rosterSockPairs, rosterPantShells,
    totalJerseys, totalSockPairs, totalPantShells, totalPlayers,
    hasRoster,
    mismatch: mismatchDetail !== null,
    mismatchDetail,
  };
}

/**
 * The estimated finish date, from when production starts.
 *
 * Returns null rather than guessing when either half is missing: no start
 * date, or no jersey type chosen yet. A date invented from an assumed build
 * type is worse than an empty field, because the empty field is obviously
 * unanswered and the invented one looks like a promise.
 */
export function estimateFinish(
  productionStartDate: CalendarDate | null,
  jerseyType: JerseyType | null,
): { min: CalendarDate; max: CalendarDate } | null {
  if (!productionStartDate || !jerseyType) return null;
  const { min, max } = LEAD_TIME_DAYS[jerseyType];
  return {
    min: addDays(productionStartDate, min),
    max: addDays(productionStartDate, max),
  };
}

/* ------------------------------------------------------------------ *
 * What's in the order
 *
 * Asking a customer for a sock size on a jerseys-only order is a question with
 * no right answer: they either guess, or they write something and wonder why.
 * Both the admin roster table and the client form hide those columns entirely,
 * and both decide it here so they can't drift apart.
 *
 * A type being set counts as well as a quantity, because an order is often
 * specced before the numbers are filled in — "embroidered pant shells, count
 * TBC" should still ask for pant shell sizes.
 * ------------------------------------------------------------------ */

type IncludesInput = Pick<Order, 'sets' | 'sockType' | 'pantShellType'>;

export function orderIncludesSocks(order: IncludesInput): boolean {
  return (
    order.sockType !== null ||
    order.sets.some((s) => (s.sockPairs || 0) + (s.extraSockPairs || 0) > 0)
  );
}

export function orderIncludesPantShells(order: IncludesInput): boolean {
  return (
    order.pantShellType !== null ||
    order.sets.some((s) => (s.pantShells || 0) + (s.extraPantShells || 0) > 0)
  );
}

/**
 * How many people are on this team — which is how many roster slots to show.
 *
 * NOT the jersey total. In home/away mode there are two sets of 20, and the
 * jerseys add up to 40, but there are still only 20 players: each one gets a
 * home shirt and an away shirt. Summing across sets asked a 20-player team to
 * fill in 40 names.
 *
 * Every set dresses the same squad, so the squad is the largest single set —
 * never the sum. That holds for one set, home/away, and any number of sets.
 *
 * `playersTotal` wins when Keenan has entered it, matching the rule everywhere
 * else: what he typed is the answer, and the sets are the fallback.
 */
export function rosterSlotCount(order: Pick<Order, 'sets' | 'playersTotal'>): number {
  if (order.playersTotal > 0) return order.playersTotal;
  return order.sets.reduce(
    (most, s) => Math.max(most, (s.playerJerseys || 0) + (s.goalieJerseys || 0)),
    0,
  );
}

/**
 * What the next roster row should claim.
 *
 * One of each, but only while the ordered quantity hasn't run out. Twelve
 * pairs of socks across fifteen players means the first twelve rows take a
 * pair and the last three take none — which is the real answer, and leaves the
 * tally balanced instead of demanding three pairs that were never bought.
 *
 * Anyone can still override a row by hand; this is only what it starts as.
 */
export function nextRowClaims(
  order: Pick<Order, 'sets'>,
  roster: RosterEntry[],
): { jerseys: boolean; socks: boolean; pantShells: boolean } {
  const declared = (pick: (s: SetQuantities) => number) => order.sets.reduce((n, s) => n + pick(s), 0);
  const assigned = (pick: (r: RosterEntry) => number) => roster.reduce((n, r) => n + (pick(r) || 0), 0);

  return {
    jerseys:
      assigned((r) => r.jerseysPerPlayer) <
      declared((s) => (s.playerJerseys || 0) + (s.goalieJerseys || 0)),
    socks: assigned((r) => r.socksPerPlayer) < declared((s) => s.sockPairs || 0),
    pantShells: assigned((r) => r.shellsPerPlayer) < declared((s) => s.pantShells || 0),
  };
}

/**
 * How many spare rows an order needs.
 *
 * max(spare jerseys, spare sock pairs), not either alone: two spare jerseys
 * and three spare sock pairs is three spares, one of them socks only. Sizing
 * to the jerseys would leave the third pair of socks with nowhere to live.
 */
export function extraRowCount(order: Pick<Order, 'sets'>): number {
  const jerseys = order.sets.reduce((n, s) => n + (s.extraJerseys || 0), 0);
  const socks = order.sets.reduce((n, s) => n + (s.extraSockPairs || 0), 0);
  return Math.max(jerseys, socks);
}

/**
 * Keep the spare list the same length as the number of spares ordered.
 *
 * Grows by appending blanks and shrinks by dropping from the end, so numbers
 * already typed stay attached to the same row. Rebuilding the list from
 * scratch on every change would renumber everything under the person's cursor.
 */
export function syncExtraJerseyDetails(
  details: ExtraJersey[],
  wanted: number,
): ExtraJersey[] {
  if (details.length === wanted) return details;
  if (details.length > wanted) return details.slice(0, wanted);
  return [
    ...details,
    ...Array.from({ length: wanted - details.length }, () => ({
      number: '', size: '', sockSize: '', sockOnly: false, notes: '',
    })),
  ];
}

/* ------------------------------------------------------------------ *
 * Tokens — long, random, per-order, revocable. Never the row id.
 * The old app used the raw database id as the share link, so a leaked link
 * was also a database key.
 * ------------------------------------------------------------------ */

export function newToken(): string {
  return (randomUUID() + randomUUID()).replace(/-/g, '');
}

export function newId(): string {
  return randomUUID();
}

/* ------------------------------------------------------------------ *
 * Blank order
 * ------------------------------------------------------------------ */

export function blankOrder(): Order {
  const now = new Date().toISOString();
  return {
    id: newId(),
    teamName: '',
    invoiceNumber: '',
    datePaid: null,
    googleDriveLink: '',
    status: 'draft',
    estimatedFinishDate: null,
    productionStartDate: null,
    productionFinishDate: null,
    extraJerseyDetails: [],
    requestApproval: false,
    approvalRecord: null,
    trackingCode: '',
    isSample: false,

    contactFirstName: '',
    contactLastName: '',
    contactEmail: '',
    contactPhone: '',
    shippingStreet: '',
    shippingSecondary: '',
    shippingCity: '',
    shippingProvince: '',
    shippingPostal: '',
    requestClientDetails: false,
    clientLinkSections: { ...DEFAULT_CLIENT_LINK_SECTIONS },

    orderMode: 'single_set',
    numberOfSets: 1,
    sets: setsForMode('single_set'),
    playersTotal: 0,

    jerseyType: null,
    sockType: null,
    pantShellType: null,

    numberDetails: '',

    dimpledShoulders: false,
    reinforcedElbows: false,
    underarmVents: false,
    frontCrest: false,
    armNumbers: false,
    printedSizingTag: false,
    ppcBackBranding: false,
    rubberizedPpcCrest: false,
    stitchedSublimatedLogos: false,
    twillBorderNumbers: false,
    stopSignPatch: false,
    pantLogo: false,
    pantNumber: false,
    lacesStyle: 'none',
    shoulderCut: 'rounded',
    nameStyle: 'free_standing_letters',

    hasCaptainPatches: false,
    captainPatchStyle: null,
    captainCQuantity: 0,
    captainAQuantity: 0,
    captainPatchNotes: '',

    hasShoulderLogos: false,
    shoulderLogosSame: true,
    jerseyTier: null,

    designReferenceNotes: '',
    collarReferenceNotes: '',
    mainCrestNotes: '',

    specialNotes: '',
    approvedBy: '',
    approvedDate: null,
    deliveryConcern: '',

    shareToken: newToken(),
    rosterToken: newToken(),

    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/**
 * A new roster row.
 *
 * `claims` says what this particular row should start out taking, which is not
 * simply "one of each". Two separate mistakes lived here:
 *
 *   1. Every row defaulted to a pair of socks, so sixteen players on a
 *      jerseys-only order conjured sixteen pairs — half of the phantom-socks
 *      bug in computeTotals.
 *   2. Rows kept claiming a pair even once the ordered quantity was used up.
 *      Fifteen players against twelve pairs of socks assigned fifteen, and the
 *      tally then demanded three pairs nobody bought.
 *
 * So the caller decides per row, from what's already assigned against what was
 * ordered — see `nextRowClaims`. Everything defaults to false: a caller that
 * forgets produces a row claiming nothing, which is visibly incomplete. The
 * old default produced a row claiming something, which looked correct.
 */
export function blankRosterEntry(
  orderId: string,
  sortOrder: number,
  claims: { jerseys?: boolean; socks?: boolean; pantShells?: boolean } = {},
): RosterEntry {
  return {
    id: newId(),
    orderId,
    playerNameAsPrinted: '',
    number: '',
    isGoalie: false,
    sockOnly: false,
    jerseySize: '',
    sockSize: '',
    pantShellSize: '',
    jerseysPerPlayer: claims.jerseys ? 1 : 0,
    socksPerPlayer: claims.socks ? 1 : 0,
    shellsPerPlayer: claims.pantShells ? 1 : 0,
    homeJersey: 0,
    awayJersey: 0,
    homeSocks: 0,
    awaySocks: 0,
    armNumbers: '',
    shoulderLogo: '',
    pantLogo: '',
    pantNumber: '',
    notes: '',
    sortOrder,
  };
}

/** Strip spaces from printed names — the roster table's "No Spaces" toggle. */
export function stripSpaces(name: string): string {
  return name.replace(/\s+/g, '');
}

export function contactFullName(order: Order): string {
  return [order.contactFirstName, order.contactLastName].filter(Boolean).join(' ');
}

export function formattedAddress(order: Order): string {
  return [
    contactFullName(order),
    order.shippingStreet,
    order.shippingSecondary,
    [order.shippingCity, order.shippingProvince].filter(Boolean).join(', '),
    order.shippingPostal,
    order.contactPhone,
  ]
    .filter(Boolean)
    .join('\n');
}

export function shipToSummary(order: Order): string {
  return [order.shippingCity, order.shippingProvince].filter(Boolean).join(', ');
}


/* ------------------------------------------------------------------ *
 * Plain-language quantity summaries
 *
 * "17 players + 1 goalie + 2 extra = 20 jerseys" reads at a glance in a way
 * four number boxes never do, and it's the sentence that catches a miscount
 * before it reaches the factory.
 * ------------------------------------------------------------------ */

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Summary for one set. Returns null when the set is entirely empty. */
export function describeSet(s: SetQuantities): string | null {
  const lines: string[] = [];

  const jerseyParts: string[] = [];
  if (s.playerJerseys) jerseyParts.push(plural(s.playerJerseys, 'player'));
  if (s.goalieJerseys) jerseyParts.push(plural(s.goalieJerseys, 'goalie'));
  if (s.extraJerseys) jerseyParts.push(`${s.extraJerseys} extra`);
  const jerseyTotal = (s.playerJerseys || 0) + (s.goalieJerseys || 0) + (s.extraJerseys || 0);
  if (jerseyTotal) {
    lines.push(`${jerseyParts.join(' + ')} = ${plural(jerseyTotal, 'jersey')}`);
  }

  const sockTotal = (s.sockPairs || 0) + (s.extraSockPairs || 0);
  if (sockTotal) {
    lines.push(
      s.extraSockPairs
        ? `${s.sockPairs} + ${s.extraSockPairs} extra = ${plural(sockTotal, 'pair')} of socks`
        : `${plural(sockTotal, 'pair')} of socks`,
    );
  }

  const shellTotal = (s.pantShells || 0) + (s.extraPantShells || 0);
  if (shellTotal) {
    lines.push(
      s.extraPantShells
        ? `${s.pantShells} + ${s.extraPantShells} extra = ${plural(shellTotal, 'pant shell')}`
        : plural(shellTotal, 'pant shell'),
    );
  }

  return lines.length ? lines.join(' · ') : null;
}

/** Whole-order summary line. */
export function describeOrderTotals(t: OrderTotals): string | null {
  const parts: string[] = [];
  if (t.totalJerseys) {
    parts.push(
      t.extraJerseys
        ? `${t.totalJerseys - t.extraJerseys} for the roster + ${t.extraJerseys} extra = ${plural(t.totalJerseys, 'jersey')}`
        : plural(t.totalJerseys, 'jersey'),
    );
  }
  if (t.totalSockPairs) {
    parts.push(
      t.extraSockPairs
        ? `${t.totalSockPairs - t.extraSockPairs} + ${t.extraSockPairs} extra = ${plural(t.totalSockPairs, 'pair')} of socks`
        : `${plural(t.totalSockPairs, 'pair')} of socks`,
    );
  }
  if (t.totalPantShells) {
    parts.push(
      t.extraPantShells
        ? `${t.totalPantShells - t.extraPantShells} + ${t.extraPantShells} extra = ${plural(t.totalPantShells, 'pant shell')}`
        : plural(t.totalPantShells, 'pant shell'),
    );
  }
  return parts.length ? parts.join(' · ') : null;
}
