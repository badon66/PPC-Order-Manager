import type { ExtraJersey, KeeperJersey, RosterEntry } from './types';

/**
 * Keeper jerseys — the ones Powerplay keeps.
 *
 * "Make an extra of this jersey for us to keep." A keeper copies one set
 * (home, away, set 3) and belongs to Powerplay, not the team: the factory
 * makes it with the run and holds it at the facility; it never ships with the
 * team's order, never shows on their sheet, and never counts toward what they
 * pay for. See KeeperJersey in types.ts for the record.
 *
 * Pure. The form and the sheets call these; nothing here touches a store or
 * the DOM, so it's tested directly (tests/keepers/).
 */

/** More than this on one set is almost certainly a typo, and the form stops there. */
export const MAX_KEEPERS_PER_SET = 10;

/** The keepers that copy one set, in the order they were added. */
export function keepersOfSet(keepers: KeeperJersey[], setIndex: number): KeeperJersey[] {
  return keepers.filter((k) => k.setIndex === setIndex);
}

/**
 * What a new keeper row starts with, supplied by the caller: the ids and the
 * randomness are injected so the rule itself stays deterministic and testable.
 */
export interface NewKeeperContext {
  /** Numbers already on a jersey in this order — see takenNumbers. */
  taken: Set<string>;
  /** Size to start the row on — see commonJerseySize. */
  size: string;
  newId: () => string;
  random?: () => number;
}

/**
 * Set how many keepers copy one set.
 *
 * Grows by appending rows and shrinks from the end, so a number already typed
 * on a row stays on that row — rebuilding the list would renumber everything
 * under the person's cursor (the spare-jersey list learned the same lesson).
 * New rows get a free random number and the roster's common size, so the
 * usual case ("one extra of the home jersey, whatever number") is one tick.
 * Keepers of the other sets are left exactly as they were.
 */
export function setKeeperCount(
  keepers: KeeperJersey[],
  setIndex: number,
  wanted: number,
  ctx: NewKeeperContext,
): KeeperJersey[] {
  const n = Math.max(0, Math.min(Math.floor(wanted) || 0, MAX_KEEPERS_PER_SET));
  const mine = keepersOfSet(keepers, setIndex);
  if (mine.length === n) return keepers;

  const others = keepers.filter((k) => k.setIndex !== setIndex);
  if (mine.length > n) return [...others, ...mine.slice(0, n)];

  const taken = new Set(ctx.taken);
  for (const k of mine) if (k.number.trim()) taken.add(k.number.trim());
  const added: KeeperJersey[] = [];
  for (let i = mine.length; i < n; i++) {
    const number = goodFreeNumber(taken, ctx.random);
    if (number) taken.add(number);
    added.push({ id: ctx.newId(), setIndex, number, name: '', size: ctx.size });
  }
  return [...others, ...mine, ...added];
}

/**
 * Every number already on a jersey in this order: roster rows that get a
 * jersey, the spares, and the keepers. Sock-only rows don't have a number on
 * anything, so they don't hold one. Trimmed, otherwise as typed: in hockey
 * "0" and "00" are different numbers and stay different here.
 */
export function takenNumbers(
  roster: ReadonlyArray<Pick<RosterEntry, 'number' | 'sockOnly'>>,
  spares: ReadonlyArray<Pick<ExtraJersey, 'number' | 'sockOnly'>>,
  keepers: ReadonlyArray<Pick<KeeperJersey, 'number'>>,
): Set<string> {
  const out = new Set<string>();
  const add = (v: string) => {
    const t = (v ?? '').trim();
    if (t) out.add(t);
  };
  for (const r of roster) if (!r.sockOnly) add(r.number);
  for (const s of spares) if (!s.sockOnly) add(s.number);
  for (const k of keepers) add(k.number);
  return out;
}

/**
 * A number nobody on the order has, from 1 to 99. Returns '' only when all 99
 * are taken, which a roster of twenty never manages — the caller then leaves
 * the row for Keenan to type. Pass `random` to make the pick repeatable.
 */
export function randomFreeNumber(taken: ReadonlySet<string>, random: () => number = Math.random): string {
  const free: string[] = [];
  for (let n = 1; n <= 99; n++) {
    const s = String(n);
    // "07" on the roster means 7 is spoken for, whichever way it was typed.
    if (!taken.has(s) && !taken.has(s.padStart(2, '0'))) free.push(s);
  }
  if (free.length === 0) return '';
  const r = Math.min(Math.max(random(), 0), 0.999999);
  return free[Math.floor(r * free.length)];
}

/**
 * The most common jersey size on the roster, so a keeper starts out the size
 * most of the team wears. Ties go to the size seen first. Sock-only rows have
 * no jersey size; a roster with no sized rows gives '' and the row is left to
 * be sized by hand.
 */
export function commonJerseySize(
  roster: ReadonlyArray<Pick<RosterEntry, 'jerseySize' | 'sockOnly'>>,
): string {
  const counts = new Map<string, number>();
  for (const r of roster) {
    if (r.sockOnly) continue;
    const s = (r.jerseySize ?? '').trim();
    if (!s) continue;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const [s, n] of counts) {
    if (n > bestN) {
      best = s;
      bestN = n;
    }
  }
  return best;
}

/**
 * Keepers whose set no longer exists. Switching an order from home/away to a
 * single set leaves the away keepers pointing at a set that isn't there; they
 * are dropped rather than quietly re-homed, because "a copy of the away
 * jersey" has no meaning on a one-set order.
 */
export function pruneKeepers(keepers: KeeperJersey[], setCount: number): KeeperJersey[] {
  const kept = keepers.filter((k) => k.setIndex >= 0 && k.setIndex < setCount);
  return kept.length === keepers.length ? keepers : kept;
}

/** "#88 (L)" / "#00 SMITH (XL)" / "no number yet (L)" — one keeper, for a sentence. */
export function describeKeeper(k: Pick<KeeperJersey, 'number' | 'name' | 'size'>): string {
  const num = k.number.trim() ? `#${k.number.trim()}` : 'no number yet';
  const name = k.name.trim() ? ` ${k.name.trim()}` : '';
  const size = k.size.trim() ? ` (${k.size.trim()})` : ' (no size yet)';
  return `${num}${name}${size}`;
}

/** "1 kept by Powerplay: #88 (L)" — the whole list, for a summary line. '' with none. */
export function describeKeepers(keepers: ReadonlyArray<Pick<KeeperJersey, 'number' | 'name' | 'size'>>): string {
  if (keepers.length === 0) return '';
  return `${keepers.length} kept by Powerplay: ${keepers.map(describeKeeper).join(', ')}`;
}

/*
 * Picking a good number (Keenan, 2026-10-23): a spare or a keeper gets a
 * number a hockey player would actually wear, not a random 1–99. Classic
 * skater numbers first; the next tier only once those are all taken; never a
 * number that reads as a joke or a tribute nobody asked for.
 */

/** The numbers skaters wear most. Tried first. */
export const CLASSIC_NUMBERS = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16',
  '17', '18', '19', '21', '22', '23', '24', '25', '27', '28',
] as const;

/** Still normal, just less common. Used once the classics are gone. */
export const SECOND_NUMBERS = [
  '20', '26', '29', '32', '34', '36', '37', '38', '39', '41', '42', '43', '44', '47',
  '55', '71', '74', '77', '88', '91', '93',
] as const;

/**
 * Never picked: 99 (retired league-wide), 66 and 87 (one player each, it reads
 * as a costume), 69, 0/00, and the goalie numbers 1, 30, 31, 35 — a spare is a
 * skater's jersey.
 */
export const NEVER_PICKED = new Set(['0', '00', '1', '30', '31', '35', '66', '69', '87', '99']);

/**
 * A good number nobody on the order has: a free classic at random, else a
 * free second-tier one, else any other free 2–98 that isn't on the never
 * list. '' when nothing's left (the row is left to type by hand).
 */
export function goodFreeNumber(taken: ReadonlySet<string>, random: () => number = Math.random): string {
  const free = (n: string) => !taken.has(n) && !taken.has(n.padStart(2, '0'));
  const pick = (list: readonly string[]) => {
    const open = list.filter(free);
    if (open.length === 0) return '';
    const r = Math.min(Math.max(random(), 0), 0.999999);
    return open[Math.floor(r * open.length)];
  };
  const rest = Array.from({ length: 97 }, (_, i) => String(i + 2)).filter(
    (n) => !NEVER_PICKED.has(n) && !(CLASSIC_NUMBERS as readonly string[]).includes(n) && !(SECOND_NUMBERS as readonly string[]).includes(n),
  );
  return pick(CLASSIC_NUMBERS) || pick(SECOND_NUMBERS) || pick(rest);
}

/**
 * Good numbers for every spare that has a jersey and no number yet, each
 * pick counted as taken for the next. Spares already numbered, and sock-only
 * spares, are left exactly as they are.
 */
export function numberBlankSpares<T extends { number: string; sockOnly: boolean }>(
  spares: T[],
  taken: ReadonlySet<string>,
  random: () => number = Math.random,
): T[] {
  const used = new Set(taken);
  for (const s of spares) if (!s.sockOnly && s.number.trim()) used.add(s.number.trim());
  return spares.map((s) => {
    if (s.sockOnly || s.number.trim()) return s;
    const n = goodFreeNumber(used, random);
    if (!n) return s;
    used.add(n);
    return { ...s, number: n };
  });
}
