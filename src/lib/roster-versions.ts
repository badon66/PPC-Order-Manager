import type { ApprovalRecord, NameStyle, Order, RosterEntry, RosterVerification, RosterVersion } from './types';
import { isNoName } from './roster-edit';

/**
 * Separate rosters on one order: Roster 1, Roster 2, …
 *
 * Every accepted import and every accepted team submission becomes its own
 * roster rather than being merged into the last one. One is IN USE — that's
 * the roster the share sheet, the factory sheet, the totals, the tally and
 * the CSV all read. The others are kept as they were until Keenan deletes
 * them, so nothing he typed is ever overwritten by a file.
 *
 * Storage: every row carries `rosterId`; the order carries the list
 * (`rosters`) and which one is in use (`activeRosterId`). Rows written before
 * this existed have no roster id and belong to ORIGINAL_ROSTER_ID, which is
 * listed as Roster 1 the moment a second roster appears.
 *
 * Pure and tested (tests/roster/versions.test.ts).
 */

export const ORIGINAL_ROSTER_ID = 'original';

export function rosterIdOf(r: Pick<RosterEntry, 'rosterId'>): string {
  return r.rosterId || ORIGINAL_ROSTER_ID;
}

export function activeRosterIdOf(o: Pick<Order, 'activeRosterId'>): string {
  return o.activeRosterId || ORIGINAL_ROSTER_ID;
}

export function rowsOfRoster<T extends Pick<RosterEntry, 'rosterId'>>(rows: T[], rosterId: string): T[] {
  return rows.filter((r) => rosterIdOf(r) === rosterId);
}

/** The rows of the roster in use. Everything customer- and factory-facing reads this. */
export function activeRows<T extends Pick<RosterEntry, 'rosterId'>>(o: Pick<Order, 'activeRosterId'>, rows: T[]): T[] {
  return rowsOfRoster(rows, activeRosterIdOf(o));
}

export interface RosterVersionSummary extends RosterVersion {
  label: string;
  rows: number;
  inUse: boolean;
}

export function rosterLabel(v: Pick<RosterVersion, 'number'>): string {
  return `Roster ${v.number}`;
}

/**
 * The rosters on an order, for the screen. An order that has only ever had
 * the one roster lists it as Roster 1 when it has rows, and nothing when it
 * hasn't — there's no point showing "Roster 1 (0 players)".
 */
export function listRosters(o: Pick<Order, 'rosters' | 'activeRosterId' | 'createdAt'>, rows: Array<Pick<RosterEntry, 'rosterId'>>): RosterVersionSummary[] {
  const active = activeRosterIdOf(o);
  const count = (id: string) => rowsOfRoster(rows, id).length;
  const known = o.rosters ?? [];
  const list: RosterVersion[] = known.length
    ? known
    : count(ORIGINAL_ROSTER_ID) > 0
      ? [originalVersion(o)]
      : [];
  return list.map((v) => ({ ...v, label: rosterLabel(v), rows: count(v.id), inUse: v.id === active }));
}

function originalVersion(o: Pick<Order, 'createdAt'>): RosterVersion {
  return {
    id: ORIGINAL_ROSTER_ID, number: 1, source: 'manual', fileName: '', submissionId: '',
    createdAt: o.createdAt, note: 'The roster as it was typed',
  };
}

/**
 * A new roster, and the order's roster list with it added. It goes into use
 * straight away (Keenan's call: accepting means "this is the roster now").
 *
 * The first time an order gets a second roster, its original rows are given
 * their entry (Roster 1) so they show up in the list rather than vanishing.
 * Numbers are never reused, so "Roster 3" means the same thing in a text
 * message next week even after Roster 2 is deleted.
 */
export function planNewRoster(
  o: Pick<Order, 'rosters' | 'activeRosterId' | 'createdAt'> & Partial<Pick<Order, 'rosterNumbersUsed'>>,
  rows: Array<Pick<RosterEntry, 'rosterId'>>,
  init: Omit<RosterVersion, 'id' | 'number' | 'createdAt'>,
  ids: { newId: string; now: string },
): { version: RosterVersion; rosters: RosterVersion[]; activeRosterId: string; numbersUsed: number } {
  const existing: RosterVersion[] = (o.rosters ?? []).length
    ? [...o.rosters]
    : rowsOfRoster(rows, ORIGINAL_ROSTER_ID).length > 0
      ? [originalVersion(o)]
      : [];
  // After the highest number ever given — not just the highest still listed.
  const number = nextRosterNumber(existing, o.rosterNumbersUsed ?? 0);
  const version: RosterVersion = { ...init, id: ids.newId, number, createdAt: ids.now };
  return { version, rosters: [...existing, version], activeRosterId: version.id, numbersUsed: number };
}

/**
 * The number the next roster will get. Never reused: it follows the highest
 * still listed AND the highest ever given (`used`), since a deleted roster's
 * number stays retired.
 */
export function nextRosterNumber(versions: Array<Pick<RosterVersion, 'number'>>, used = 0): number {
  return Math.max(used, versions.reduce((m, v) => Math.max(m, v.number), 0)) + 1;
}

/** A listed roster back to what's stored on the order: the screen-only fields dropped. */
function stored(v: RosterVersionSummary): RosterVersion {
  const out: RosterVersion = {
    id: v.id, number: v.number, source: v.source, fileName: v.fileName,
    submissionId: v.submissionId, createdAt: v.createdAt, note: v.note,
  };
  if (v.fileUrl) out.fileUrl = v.fileUrl;
  return out;
}

/** Put another roster in use. Refused for a roster that isn't on the order. */
export function planUseRoster(
  o: Pick<Order, 'rosters' | 'activeRosterId' | 'createdAt'>,
  rows: Array<Pick<RosterEntry, 'rosterId'>>,
  rosterId: string,
): { ok: true; activeRosterId: string; rosters: RosterVersion[] } | { ok: false; error: string } {
  const list = listRosters(o, rows);
  if (!list.some((v) => v.id === rosterId)) return { ok: false, error: "That roster isn't on this order." };
  return { ok: true, activeRosterId: rosterId, rosters: list.map(stored) };
}

/**
 * Delete a roster. The one in use can't be deleted — switch first — so the
 * sheets are never left pointing at nothing.
 */
export function planDeleteRoster(
  o: Pick<Order, 'rosters' | 'activeRosterId' | 'createdAt'>,
  rows: Array<Pick<RosterEntry, 'rosterId' | 'id'>>,
  rosterId: string,
): { ok: true; rosters: RosterVersion[]; deleteRowIds: string[] } | { ok: false; error: string } {
  const list = listRosters(o, rows);
  const target = list.find((v) => v.id === rosterId);
  if (!target) return { ok: false, error: "That roster isn't on this order." };
  if (target.inUse) return { ok: false, error: `${target.label} is the roster in use. Put another one in use first.` };
  return {
    ok: true,
    rosters: list.filter((v) => v.id !== rosterId).map(stored),
    deleteRowIds: rowsOfRoster(rows, rosterId).map((r) => r.id),
  };
}

/* ------------------------------------------------------------------ *
 * What the customer verified at sign-off
 * ------------------------------------------------------------------ */

/**
 * The roster part of a sign-off: which roster was in use, how many players,
 * and a fingerprint of what it printed. `rows` are the rows of the roster in
 * use; `versions` the order's roster list (for its number).
 */
export function rosterVerificationOf(
  o: Pick<Order, 'activeRosterId' | 'nameStyle'>,
  rows: RosterEntry[],
  versions: Array<Pick<RosterVersion, 'id' | 'number'>>,
  statement: string,
): RosterVerification {
  const id = activeRosterIdOf(o);
  return {
    statement,
    rosterId: id,
    rosterNumber: versions.find((v) => v.id === id)?.number ?? 1,
    rows: rows.length,
    fingerprint: rosterFingerprint(rows, o.nameStyle),
  };
}

/**
 * Has the roster changed since the customer ticked "I've checked the roster"?
 * Another roster put in use, or any name, number, goalie or captain mark, or
 * size changed on the one they checked. Null when there's nothing to compare
 * (no sign-off, or one from before the roster had its own box).
 */
export function rosterChangedSinceSignOff(
  o: Pick<Order, 'activeRosterId' | 'nameStyle'> & { approvalRecord: ApprovalRecord | null },
  rows: RosterEntry[],
): { changed: boolean; verified: RosterVerification } | null {
  const verified = o.approvalRecord?.roster ?? null;
  if (!verified) return null;
  const changed = verified.rosterId !== activeRosterIdOf(o) || verified.fingerprint !== rosterFingerprint(rows, o.nameStyle);
  return { changed, verified };
}

/* ------------------------------------------------------------------ *
 * Fingerprint
 * ------------------------------------------------------------------ */

/**
 * A short fingerprint of what a roster prints: names, numbers, goalie and
 * captain marks, sizes. Recorded when a customer verifies the roster at
 * sign-off, so a change afterwards is caught ("the roster changed after they
 * checked it") rather than discovered when the box arrives.
 *
 * Not security — a change detector. FNV-1a, 64-bit, over a canonical line per
 * row in roster order.
 */
export function rosterFingerprint(rows: RosterEntry[], nameStyle: NameStyle): string {
  const lines = [...rows]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) =>
      [
        isNoName(r, nameStyle) ? '<no name>' : r.playerNameAsPrinted.trim(),
        r.number.trim(),
        r.isGoalie ? 'G' : '',
        r.captaincy,
        r.sockOnly ? 'socks only' : r.jerseySize.trim(),
        r.sockSize.trim(),
        r.pantShellSize.trim(),
      ].join('\u001f'),
    );
  const text = `${lines.length}\u001e${lines.join('\u001e')}`;
  // BigInt() rather than literals: the project targets below ES2020.
  let h = BigInt('0xcbf29ce484222325');
  const prime = BigInt('0x100000001b3');
  const mask = BigInt('0xffffffffffffffff');
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}
