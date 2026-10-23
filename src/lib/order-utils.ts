import type { ExtraJersey, JerseyTier, JerseyType, Order, OrderMode, PantShellType, RosterEntry, SetQuantities, SockType } from './types';
import { DEFAULT_CLIENT_LINK_SECTIONS } from './types';
import { BUILD_ADDON_KEYS, LEAD_TIME_DAYS } from './constants';
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
    // A set's own build is kept when the mode is re-applied; the first set never has one.
    ...(i > 0 && existing[i]?.jerseyType ? { jerseyType: existing[i].jerseyType, jerseyTier: existing[i].jerseyTier ?? null } : {}),
    ...(i > 0 && existing[i]?.sockType ? { sockType: existing[i].sockType } : {}),
    ...(i > 0 && existing[i]?.pantShellType ? { pantShellType: existing[i].pantShellType } : {}),
    ...(i > 0 && existing[i]?.addons ? { addons: existing[i].addons } : {}),
  });

  if (mode === 'single_set') return [blank('Single Set', 0)];
  if (mode === 'home_away_set') return [blank('Home Set', 0), blank('Away Set', 1)];
  const n = Math.max(1, Math.min(numberOfSets || 1, 12));
  return Array.from({ length: n }, (_, i) => blank(`Set ${i + 1}`, i));
}

/* ------------------------------------------------------------------ *
 * Captain patches per set
 *
 * A home/away order's C's and A's are two designs, so they're counted
 * separately: captainC/AQuantity is the home set's, captainAwayC/AQuantity
 * the away set's. Any other order has one count.
 * ------------------------------------------------------------------ */

export interface CaptainCount {
  /** 'Home' / 'Away', or '' when there's only one count. */
  label: string;
  c: number;
  a: number;
}

export function captainCounts(
  o: Pick<Order, 'orderMode' | 'captainCQuantity' | 'captainAQuantity' | 'captainAwayCQuantity' | 'captainAwayAQuantity'>,
): CaptainCount[] {
  if (o.orderMode === 'home_away_set') {
    return [
      { label: 'Home', c: o.captainCQuantity || 0, a: o.captainAQuantity || 0 },
      { label: 'Away', c: o.captainAwayCQuantity || 0, a: o.captainAwayAQuantity || 0 },
    ];
  }
  return [{ label: '', c: o.captainCQuantity || 0, a: o.captainAQuantity || 0 }];
}

/* ------------------------------------------------------------------ *
 * Custom branding files
 * ------------------------------------------------------------------ */

/**
 * The files of one custom branding logo. Files uploaded before an order could
 * have several have no groupId; they belong to the first.
 */
export function customBrandingFiles<A extends { role: string; groupId?: string }>(
  items: Array<{ id: string }>,
  assets: A[],
  itemId: string,
): A[] {
  const first = items[0]?.id;
  return assets.filter(
    (a) =>
      (a.role === 'custom_branding_logo' || a.role === 'custom_branding_placement') &&
      (a.groupId === itemId || (!a.groupId && itemId === first)),
  );
}

/* ------------------------------------------------------------------ *
 * Builds per set
 *
 * Usually the whole order is one build. Home and away (or several sets) can
 * differ — home embroidered, away sublimated. The order's own jerseyType and
 * jerseyTier are the FIRST set's; a later set carries its own only when it
 * differs. Everything that reads a build per set goes through here.
 * ------------------------------------------------------------------ */

export interface SetBuild {
  label: string;
  jerseyType: JerseyType | null;
  jerseyTier: JerseyTier | null;
  sockType: SockType | null;
  pantShellType: PantShellType | null;
  /** Pairs of socks / pant shells in this set, extras included. */
  socks: number;
  shells: number;
  /** This set's build add-ons (BUILD_ADDON_KEYS): its own when it has them, else the order's. */
  addons: Record<string, boolean>;
}

type BuildInput = Pick<Order, 'sets' | 'jerseyType' | 'jerseyTier'> & Partial<Pick<Order, 'sockType' | 'pantShellType'>>;

/** The order's own (first set's) build add-ons, as a map. */
export function orderBuildAddons(o: object): Record<string, boolean> {
  const r = o as Record<string, unknown>;
  return Object.fromEntries(BUILD_ADDON_KEYS.map((k) => [k, Boolean(r[k])]));
}

/** A set's build add-ons: a later set's own when the builds differ, else the order's. */
export function setAddons(o: BuildInput, i: number): Record<string, boolean> {
  const base = orderBuildAddons(o);
  const own = i > 0 && buildsDiffer(o) ? o.sets[i]?.addons : undefined;
  return own ? { ...base, ...own } : base;
}

const setSocks = (s: Order['sets'][number]) => (s.sockPairs || 0) + (s.extraSockPairs || 0);
const setShells = (s: Order['sets'][number]) => (s.pantShells || 0) + (s.extraPantShells || 0);

/**
 * Does each set pick its own sock type? Only when the sets are different
 * builds and two or more of them have socks (Keenan, 2026-10-21: socks on
 * one set is one pair a player, one type).
 */
export function perSetSockTypes(o: BuildInput): boolean {
  return buildsDiffer(o) && o.sets.filter((s) => setSocks(s) > 0).length >= 2;
}

/** The same for pant shells. */
export function perSetShellTypes(o: BuildInput): boolean {
  return buildsDiffer(o) && o.sets.filter((s) => setShells(s) > 0).length >= 2;
}

export function setBuilds(o: BuildInput): SetBuild[] {
  const socksEach = perSetSockTypes(o);
  const shellsEach = perSetShellTypes(o);
  return o.sets.map((s, i) => ({
    label: s.label,
    jerseyType: i > 0 && s.jerseyType ? s.jerseyType : o.jerseyType,
    jerseyTier: i > 0 && s.jerseyType ? s.jerseyTier ?? null : o.jerseyTier,
    sockType: socksEach && i > 0 && s.sockType ? s.sockType : o.sockType ?? null,
    pantShellType: shellsEach && i > 0 && s.pantShellType ? s.pantShellType : o.pantShellType ?? null,
    socks: setSocks(s),
    shells: setShells(s),
    addons: setAddons(o, i),
  }));
}

/** Are the sets built differently? (Only a later set with its own type counts.) */
export function buildsDiffer(o: Pick<Order, 'sets' | 'jerseyType' | 'jerseyTier'>): boolean {
  return o.sets.some((s, i) => i > 0 && Boolean(s.jerseyType));
}

/** Every jersey type on the order — one, or more when the sets differ. */
export function jerseyTypesInUse(o: Pick<Order, 'sets' | 'jerseyType' | 'jerseyTier'>): Array<JerseyType | null> {
  return [...new Set(setBuilds(o).map((b) => b.jerseyType))];
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
export type TotalsInput = Pick<Order, 'sets' | 'orderMode'>;

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
    totalJerseys, totalSockPairs, totalPantShells,
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

/**
 * Is the order open for the customer's sign-off?
 *
 * Either Keenan switched "request approval" on in the order form, or the
 * order is at "ready for sign-off". The status alone has to be enough: moving
 * an order there and sending the proof email is how Keenan asks for the
 * signature, and a sheet with no place to sign leaves the customer stuck.
 */
export function approvalOpen(order: Pick<Order, 'requestApproval' | 'status'>): boolean {
  return order.requestApproval || order.status === 'waiting_for_approval';
}

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
 * Goalie pant shells are a thing to decide only when there's a goalie to
 * dress and shells on the order. The reversed-logo option (logos on the back
 * of the legs, so the pads don't hide them) is offered exactly then.
 */
export function offersGoaliePantOption(order: Pick<IncludesInput, 'sets' | 'pantShellType'>): boolean {
  return (
    order.sets.some((s) => (s.goalieJerseys || 0) > 0) &&
    orderIncludesPantShells({ ...order, sockType: null })
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
 * There is no separate "number of players" field any more. It was a second
 * number meaning the same thing as the jersey count, kept in step by hand, and
 * it drifted — an order for 16 jerseys with the field left at 0 reported no
 * players at all. One number, derived, can't disagree with itself.
 */
export function rosterSlotCount(order: Pick<Order, 'sets'>): number {
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
export function extraRowCount(order: Pick<Order, 'sets'> & { orderMode?: OrderMode }): number {
  return Math.max(spareCount(order, 'extraJerseys'), spareCount(order, 'extraSockPairs'));
}

/**
 * How many spares get this garment — counted as spares, not as garments.
 *
 * On a home/away order a spare is a person: 2 extra home jerseys and 2 extra
 * away jerseys are 2 spares, each with a home and an away jersey, not 4
 * (Keenan, 2026-10-23 — two sets doubled every spare to number). So it's the
 * largest set's count there. Any other order adds the sets up.
 */
export function spareCount(
  order: Pick<Order, 'sets'> & { orderMode?: OrderMode },
  kind: 'extraJerseys' | 'extraSockPairs',
): number {
  const counts = order.sets.map((s) => s[kind] || 0);
  return order.orderMode === 'home_away_set'
    ? Math.max(0, ...counts)
    : counts.reduce((n, c) => n + c, 0);
}

/**
 * The garments spare number `i` (0-based) accounts for. On a home/away order,
 * one per set that has at least i+1 extras (2 home + 3 away: spares 1 and 2
 * get both, spare 3 only the away); otherwise one.
 */
export function spareUnits(
  order: Pick<Order, 'sets'> & { orderMode?: OrderMode },
  kind: 'extraJerseys' | 'extraSockPairs',
  i: number,
): number {
  if (order.orderMode !== 'home_away_set') return 1;
  return order.sets.filter((s) => i < (s[kind] || 0)).length;
}

/**
 * Keep the spare list the same length as the number of spares ordered.
 *
 * Grows by appending blanks and shrinks by dropping blank rows from the end,
 * so numbers already typed stay attached to the same row — and a filled-in
 * spare is never dropped at all (clear it and it goes). Rebuilding the list from
 * scratch on every change would renumber everything under the person's cursor.
 */
export function syncExtraJerseyDetails(
  details: ExtraJersey[],
  wanted: number,
): ExtraJersey[] {
  if (details.length === wanted) return details;
  if (details.length > wanted) {
    // Drop blank rows, last first. A spare that already has a number or a
    // size is never thrown away to make the count fit — the form says the
    // rows and the count disagree instead (2026-10-23, when home/away spares
    // stopped being counted twice and some lists got shorter).
    const blank = (x: ExtraJersey) => !x.number.trim() && !x.size.trim() && !x.sockSize.trim() && !x.notes.trim();
    let excess = details.length - wanted;
    const kept = [...details];
    for (let i = kept.length - 1; i >= 0 && excess > 0; i--) {
      if (blank(kept[i])) { kept.splice(i, 1); excess--; }
    }
    return kept.length === details.length ? details : kept;
  }
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
    goaliePantReversedLogos: false,
    lacesStyle: 'none',
    shoulderCut: 'rounded',
    stitchedShoulderTrim: false,
    multiPanelSocks: false,
    orderValue: null,
    completedAt: null,
    paymentsReceived: null,
    sentToFactoryAt: null,
    nameStyle: 'free_standing_letters',

    hasCaptainPatches: false,
    captainPatchStyle: null,
    captainCQuantity: 0,
    captainAQuantity: 0,
    captainAwayCQuantity: 0,
    captainAwayAQuantity: 0,
    captainPatchNotes: '',

    hasShoulderLogos: false,
    shoulderLogosSame: true,
    jerseyTier: null,

    designReferenceNotes: '',
    collarReferenceNotes: '',
    mainCrestNotes: '',

    brandingNotes: '',
    customBranding: false,
    customBrandingNotes: '',
    customBrandingItems: [],
    sectionComments: {},
    specialNotes: '',
    factoryNotes: '',
    keeperJerseys: [],
    rosters: [],
    activeRosterId: '',
    rosterNumbersUsed: 0,
    rosterReads: [],
    approvedBy: '',
    approvedDate: null,
    deliveryConcern: '',
    customerEmails: [],

    source: 'manual',
    enquiry: null,

    shareToken: newToken(),
    rosterToken: newToken(),
    factoryToken: newToken(),

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
  /**
   * Home/away ticks for a new row. Absent = all off, which is what a
   * single-set order wants; the roster table passes `nextHomeAwayClaims` so a
   * home/away row starts with every box the order still has quantity for
   * ticked, instead of four empty boxes to click on every player.
   */
  ticks: { homeJersey?: boolean; awayJersey?: boolean; homeSocks?: boolean; awaySocks?: boolean } = {},
): RosterEntry {
  return {
    id: newId(),
    orderId,
    playerNameAsPrinted: '',
    number: '',
    isGoalie: false,
    captaincy: '',
    sockOnly: false,
    noName: false,
    jerseySize: '',
    sockSize: '',
    pantShellSize: '',
    jerseysPerPlayer: claims.jerseys ? 1 : 0,
    socksPerPlayer: claims.socks ? 1 : 0,
    shellsPerPlayer: claims.pantShells ? 1 : 0,
    homeJersey: ticks.homeJersey ? 1 : 0,
    awayJersey: ticks.awayJersey ? 1 : 0,
    homeSocks: ticks.homeSocks ? 1 : 0,
    awaySocks: ticks.awaySocks ? 1 : 0,
    armNumbers: '',
    shoulderLogo: '',
    pantLogo: '',
    pantNumber: '',
    notes: '',
    sortOrder,
    // Keenan's own row. Never a client submission's, so accepting one can
    // never delete it.
    fromSubmissionId: '',
    rosterId: '',
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
