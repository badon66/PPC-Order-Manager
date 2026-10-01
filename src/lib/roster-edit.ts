import type { NameStyle, OrderMode, RosterEntry, SetQuantities } from './types';

/**
 * Roster editing rules.
 *
 * Everything the roster table does that is a RULE rather than a widget lives
 * here, in plain TypeScript with no React in it: which rows a shift-click
 * selects, what a bulk edit writes, how sizes are counted, when a row is
 * "no name". The table calls these; the CSV and the share sheet call the same
 * ones. One definition, so the three can't develop different opinions — and
 * every function here has a test in tests/roster/roster-edit.test.ts.
 */

/* ------------------------------------------------------------------ *
 * No name
 * ------------------------------------------------------------------ */

/**
 * Is this jersey going out with no name on the back?
 *
 * Two ways to get there, and they are kept distinct on purpose:
 *
 *   - the row is ticked `noName` by hand — "there is a name here but don't
 *     print it";
 *   - the ORDER's name style is No Letters and the row has no name typed.
 *
 * The second is DERIVED, not written to the row. Flipping Name Style writes
 * nothing, so there is nothing to get out of step and nothing to undo: set it
 * back to Name Bars and the blank rows are simply blank rows again. A row that
 * does have a name typed under No Letters is left alone — Keenan's call, and
 * the rule he asked for.
 */
export function isNoName(
  row: Pick<RosterEntry, 'noName' | 'playerNameAsPrinted' | 'sockOnly'>,
  nameStyle: NameStyle,
): boolean {
  if (row.sockOnly) return false; // no jersey, so the question doesn't arise
  if (row.noName) return true;
  return nameStyle === 'none' && row.playerNameAsPrinted.trim() === '';
}

/** What the manufacturer's file prints in the name column for such a row. */
export const NO_NAME_LABEL = 'NO NAME';

/** Recognises the label on the way back in, so an exported CSV round-trips. */
export function parsesAsNoName(cell: string): boolean {
  return /^\s*no[\s_-]*name\s*$/i.test(cell);
}

/* ------------------------------------------------------------------ *
 * Default ticks for a new row
 * ------------------------------------------------------------------ */

export interface HomeAwayClaims {
  homeJersey: boolean;
  awayJersey: boolean;
  homeSocks: boolean;
  awaySocks: boolean;
}

/**
 * What a new home/away row should start ticked.
 *
 * Everything the order includes — ticked — for as long as THAT set still has
 * quantity left. Home socks count against set 1's pairs, away socks against
 * set 2's; `nextRowClaims` pools them, which is right for a single-set order
 * and wrong here, where the two sets can and do differ.
 *
 * So fifteen players on an order with fifteen home and twelve away pairs start
 * with home socks on every row and away socks on the first twelve. The tally
 * balances on its own instead of demanding three pairs nobody bought.
 */
export function nextHomeAwayClaims(sets: SetQuantities[], roster: RosterEntry[]): HomeAwayClaims {
  const jerseys = (s?: SetQuantities) => (s ? (s.playerJerseys || 0) + (s.goalieJerseys || 0) : 0);
  const pairs = (s?: SetQuantities) => s?.sockPairs || 0;
  const sum = (pick: (r: RosterEntry) => number) => roster.reduce((n, r) => n + (pick(r) || 0), 0);

  return {
    homeJersey: sum((r) => r.homeJersey) < jerseys(sets[0]),
    awayJersey: sum((r) => r.awayJersey) < jerseys(sets[1]),
    homeSocks: sum((r) => r.homeSocks) < pairs(sets[0]),
    awaySocks: sum((r) => r.awaySocks) < pairs(sets[1]),
  };
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

/**
 * The next selection after a click on `clickedId`.
 *
 * Plain click toggles the row. Shift-click selects every row between the last
 * row clicked (the anchor) and this one, inclusive, ADDING to what is already
 * selected — the way a file manager does it. Shift-click with no anchor is a
 * plain click.
 *
 * Selection is a set of row IDS, never positions. Removing a row above a
 * selected one must not slide the selection onto the next player down.
 */
export function nextSelection(
  current: ReadonlySet<string>,
  orderedIds: readonly string[],
  clickedId: string,
  anchorId: string | null,
  shift: boolean,
): Set<string> {
  const next = new Set(current);
  const to = orderedIds.indexOf(clickedId);
  const from = anchorId ? orderedIds.indexOf(anchorId) : -1;

  if (shift && from >= 0 && to >= 0) {
    const [lo, hi] = from < to ? [from, to] : [to, from];
    for (let i = lo; i <= hi; i++) next.add(orderedIds[i]);
    return next;
  }
  if (next.has(clickedId)) next.delete(clickedId);
  else next.add(clickedId);
  return next;
}

/** A selection with any id that no longer exists dropped — called after a remove. */
export function pruneSelection(current: ReadonlySet<string>, orderedIds: readonly string[]): Set<string> {
  const live = new Set(orderedIds);
  return new Set([...current].filter((id) => live.has(id)));
}

/* ------------------------------------------------------------------ *
 * Bulk edit
 * ------------------------------------------------------------------ */

/**
 * One bulk edit. Every field is optional, and an ABSENT field is not written.
 *
 * That is the rule that makes a bulk edit safe: setting everyone's sock size
 * cannot blank their jersey sizes, because the jersey size isn't in the patch.
 * An explicit '' or 0 IS a write — that's how "clear the number" is spelled.
 */
export interface BulkPatch {
  playerNameAsPrinted?: string;
  number?: string;
  noName?: boolean;
  jerseySize?: string;
  sockSize?: string;
  pantShellSize?: string;
  /* single-set mode */
  jerseysPerPlayer?: number;
  socksPerPlayer?: number;
  /* home/away mode */
  homeJersey?: 0 | 1;
  awayJersey?: 0 | 1;
  homeSocks?: 0 | 1;
  awaySocks?: 0 | 1;
  notes?: string;
}

/**
 * Apply `patch` to the selected rows only; everything else is returned as-is
 * (same object, so React sees no change on untouched rows).
 *
 * Two guards that aren't the caller's job to remember:
 *   - a sock-only row never receives a jersey size or jersey tick, whatever
 *     the patch says — it has no jersey;
 *   - a jersey size is only written to a row whose cut it fits. A mixed
 *     skater/goalie selection with a jersey size in the patch writes it to
 *     the rows of the cut the dialog offered (`forGoalies`) and leaves the
 *     others. The dialog withholds the field for mixed selections; this is
 *     the second line of defence.
 */
export function applyBulkPatch(
  rows: RosterEntry[],
  selected: ReadonlySet<string>,
  patch: BulkPatch,
  forGoalies: boolean | null = null,
): RosterEntry[] {
  if (selected.size === 0 || Object.keys(patch).length === 0) return rows;
  return rows.map((r) => {
    if (!selected.has(r.id)) return r;
    const p: Partial<RosterEntry> = { ...patch };
    if (r.sockOnly) {
      delete p.jerseySize;
      delete p.jerseysPerPlayer;
      delete p.homeJersey;
      delete p.awayJersey;
      delete p.noName;
      delete p.playerNameAsPrinted;
      delete p.number;
    }
    if (p.jerseySize !== undefined && forGoalies !== null && r.isGoalie !== forGoalies) {
      delete p.jerseySize;
    }
    return Object.keys(p).length ? { ...r, ...p } : r;
  });
}

/** Which cut a selection is, for the dialog's jersey-size list. */
export function selectionCut(
  rows: RosterEntry[],
  selected: ReadonlySet<string>,
): 'skaters' | 'goalies' | 'mixed' | 'none' {
  let skaters = 0;
  let goalies = 0;
  for (const r of rows) {
    if (!selected.has(r.id) || r.sockOnly) continue;
    if (r.isGoalie) goalies++;
    else skaters++;
  }
  if (!skaters && !goalies) return 'none';
  if (skaters && goalies) return 'mixed';
  return goalies ? 'goalies' : 'skaters';
}

/* ------------------------------------------------------------------ *
 * Size breakdown
 * ------------------------------------------------------------------ */

export interface SizeBucket {
  size: string;
  count: number;
}

export interface SizeBreakdown {
  /** In the controlled list's order, then anything off-list in first-seen order. */
  buckets: SizeBucket[];
  /** Rows that should have a size and don't. */
  missing: number;
}

/**
 * Count sizes in the size list's own order. YS, YM, YL, S, M, L, XL reads as a
 * run; the same counts alphabetically read as noise and hide the gap. Anything
 * off-list (an old row, a CSV typo) is still counted — a size that silently
 * vanishes from the cut sheet is worse than one in the wrong place.
 */
export function sizeBreakdown(values: readonly string[], order: readonly string[]): SizeBreakdown {
  const counts = new Map<string, number>();
  let missing = 0;
  for (const v of values) {
    const t = (v ?? '').trim();
    if (!t) missing++;
    else counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const buckets: SizeBucket[] = [];
  for (const size of order) {
    const n = counts.get(size);
    if (n) {
      buckets.push({ size, count: n });
      counts.delete(size);
    }
  }
  for (const [size, count] of counts) buckets.push({ size, count });
  return { buckets, missing };
}

/** Which rows count for which garment — not the same list. */
export function sizedRows(rows: RosterEntry[], garment: 'jersey' | 'sock' | 'pant'): RosterEntry[] {
  // A sock-only participant has no jersey; counting them as "no jersey size"
  // would put a permanent red mark on a correct roster.
  return garment === 'jersey' ? rows.filter((r) => !r.sockOnly) : rows;
}

/** Whether this mode uses the four tick boxes or the two quantity fields. */
export function usesTicks(mode: OrderMode): boolean {
  return mode === 'home_away_set';
}
