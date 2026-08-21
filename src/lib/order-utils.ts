import type { Order, OrderMode, RosterEntry, SetQuantities } from './types';
import { DEFAULT_CLIENT_LINK_SECTIONS } from './types';

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
 * Rule: when a roster exists, it is the truth. The manually-entered set
 * quantities are still stored (they're how an order starts, before a roster
 * arrives), but any disagreement is surfaced instead of silently displayed
 * as two different numbers in two places.
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
   * What the UI should show — the number that actually gets produced.
   * Roster wins over declared counts when a roster exists, and extras are
   * always added on top.
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

export function computeTotals(order: Order, roster: RosterEntry[]): OrderTotals {
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
  // Extras are additive in every case — no roster row accounts for them.
  const totalJerseys = (hasRoster ? rosterJerseys : declaredJerseys) + extraJerseys;
  const totalSockPairs = (hasRoster ? rosterSockPairs : declaredSockPairs) + extraSockPairs;
  const totalPantShells = (hasRoster ? rosterPantShells : declaredPantShells) + extraPantShells;
  const totalPlayers = hasRoster ? playing.length : order.playersTotal || 0;

  let mismatchDetail: string | null = null;
  if (hasRoster && declaredJerseys > 0 && declaredJerseys !== rosterJerseys) {
    mismatchDetail =
      `Set quantities add up to ${declaredJerseys} jerseys, but the roster works out to ${rosterJerseys}. ` +
      `Check before this goes to production.`;
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

export function blankRosterEntry(orderId: string, sortOrder: number): RosterEntry {
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
    jerseysPerPlayer: 1,
    socksPerPlayer: 1,
    shellsPerPlayer: 0,
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
