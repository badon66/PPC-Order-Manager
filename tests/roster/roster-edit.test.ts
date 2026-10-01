import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBulkPatch, isNoName, nextHomeAwayClaims, nextSelection, parsesAsNoName, pruneSelection,
  selectionCut, sizeBreakdown, NO_NAME_LABEL,
} from '@/lib/roster-edit';
import { blankRosterEntry } from '@/lib/order-utils';
import { rosterToCsv, csvToRoster } from '@/lib/csv';
import { healRosterEntry } from '@/lib/data/logic';
import type { RosterEntry, SetQuantities } from '@/lib/types';

/* ------------------------------------------------------------------ */

function row(over: Partial<RosterEntry> = {}): RosterEntry {
  return { ...blankRosterEntry('o1', 0), ...over };
}
function ids(rows: RosterEntry[]) {
  return rows.map((r) => r.id);
}
function set(over: Partial<SetQuantities>): SetQuantities {
  // Spelled out, no cast: if SetQuantities grows a field this stops compiling,
  // which is the point.
  return {
    label: '', playerJerseys: 0, goalieJerseys: 0, sockPairs: 0, pantShells: 0,
    extraJerseys: 0, extraSockPairs: 0, extraPantShells: 0, extrasNotes: '', notes: '', ...over,
  };
}

/* ------------------------------------------------------------------ *
 * No name
 * ------------------------------------------------------------------ */

test('isNoName: a ticked row is no-name under any name style', () => {
  const r = row({ noName: true, playerNameAsPrinted: 'SMITH' });
  assert.equal(isNoName(r, 'name_bars'), true);
  assert.equal(isNoName(r, 'none'), true);
});

test('isNoName: No Letters makes a BLANK row no-name, and leaves a typed name alone', () => {
  assert.equal(isNoName(row({ playerNameAsPrinted: '' }), 'none'), true);
  assert.equal(isNoName(row({ playerNameAsPrinted: '   ' }), 'none'), true);
  assert.equal(isNoName(row({ playerNameAsPrinted: 'SMITH' }), 'none'), false);
});

test('isNoName: a blank row under Name Bars is just unfinished, not no-name', () => {
  assert.equal(isNoName(row({ playerNameAsPrinted: '' }), 'name_bars'), false);
});

test('isNoName: never for a sock-only participant', () => {
  assert.equal(isNoName(row({ sockOnly: true, noName: true }), 'none'), false);
});

test('healRosterEntry gives an old row noName: false', () => {
  const r = row() as Partial<RosterEntry>;
  delete r.noName;
  assert.equal(healRosterEntry(r as RosterEntry).noName, false);
});

test('CSV prints NO NAME for ticked and derived rows, and round-trips it', () => {
  const roster = [
    row({ playerNameAsPrinted: 'SMITH', number: '9' }),
    row({ playerNameAsPrinted: '', number: '12' }),           // derived under No Letters
    row({ playerNameAsPrinted: 'JONES', number: '4', noName: true }), // ticked
  ];
  const csv = rosterToCsv(roster, 'none');
  const lines = csv.trim().split(/\r?\n/).slice(1);
  assert.equal(lines[0].split(',')[0], 'SMITH');
  assert.equal(lines[1].split(',')[0], NO_NAME_LABEL);
  assert.equal(lines[2].split(',')[0], NO_NAME_LABEL);

  // The same file imported back: NO NAME is a flag, not a name to print.
  const back = csvToRoster(csv, 'o1');
  assert.equal(back.problems.length, 0);
  assert.equal(back.entries.length, 3);
  assert.equal(back.entries[1].noName, true);
  assert.equal(back.entries[1].playerNameAsPrinted, '');
  assert.equal(back.entries[1].number, '12');
});

test('CSV under Name Bars prints a blank for a blank, not NO NAME', () => {
  const csv = rosterToCsv([row({ playerNameAsPrinted: '', number: '12' })], 'name_bars');
  assert.equal(csv.trim().split(/\r?\n/)[1].split(',')[0], '');
});

test('CSV import accepts a numbers-only roster', () => {
  const back = csvToRoster('Player Name,Number\n,7\n,8\n', 'o1');
  assert.equal(back.problems.length, 0);
  assert.deepEqual(back.entries.map((e) => e.number), ['7', '8']);
});

test('CSV import still rejects a row with nothing to identify the jersey', () => {
  // A size but no name and no number: there's a garment and no way to say
  // whose. (A fully blank line is dropped by the parser before this check.)
  const back = csvToRoster('Player Name,Number,Jersey Size\n,,L\n', 'o1');
  assert.equal(back.entries.length, 0);
  assert.equal(back.problems.length, 1);
  assert.match(back.problems[0].reason, /name or number/i);
});

test('parsesAsNoName tolerates the spellings people type', () => {
  for (const s of ['NO NAME', 'no name', 'No-Name', 'no_name', ' noname ']) assert.equal(parsesAsNoName(s), true, s);
  assert.equal(parsesAsNoName('Noah Namek'), false);
});

/* ------------------------------------------------------------------ *
 * Default ticks
 * ------------------------------------------------------------------ */

test('nextHomeAwayClaims: everything on while each set has quantity', () => {
  const sets = [set({ playerJerseys: 15, sockPairs: 15 }), set({ playerJerseys: 15, sockPairs: 12 })];
  const c = nextHomeAwayClaims(sets, []);
  assert.deepEqual(c, { homeJersey: true, awayJersey: true, homeSocks: true, awaySocks: true });
});

test('nextHomeAwayClaims: away socks stop at the AWAY set\'s pairs, not the pooled total', () => {
  const sets = [set({ playerJerseys: 15, sockPairs: 15 }), set({ playerJerseys: 15, sockPairs: 12 })];
  const twelve = Array.from({ length: 12 }, () => row({ homeJersey: 1, awayJersey: 1, homeSocks: 1, awaySocks: 1 }));
  const c = nextHomeAwayClaims(sets, twelve);
  assert.equal(c.homeSocks, true);
  assert.equal(c.awaySocks, false); // 12 of 12 placed
  assert.equal(c.homeJersey, true);
});

test('nextHomeAwayClaims: a jerseys-only order ticks no socks', () => {
  const c = nextHomeAwayClaims([set({ playerJerseys: 10 }), set({ playerJerseys: 10 })], []);
  assert.equal(c.homeSocks, false);
  assert.equal(c.awaySocks, false);
});

test('blankRosterEntry writes the ticks it is given and nothing else', () => {
  const r = blankRosterEntry('o1', 0, {}, { homeJersey: true, awaySocks: true });
  assert.equal(r.homeJersey, 1);
  assert.equal(r.awayJersey, 0);
  assert.equal(r.homeSocks, 0);
  assert.equal(r.awaySocks, 1);
  assert.equal(r.noName, false);
});

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

const five = ['a', 'b', 'c', 'd', 'e'];

test('plain click toggles one row', () => {
  let s = nextSelection(new Set(), five, 'b', null, false);
  assert.deepEqual([...s], ['b']);
  s = nextSelection(s, five, 'b', 'b', false);
  assert.deepEqual([...s], []);
});

test('shift-click selects the range from the anchor, inclusive, either direction', () => {
  let s = nextSelection(new Set(['b']), five, 'd', 'b', true);
  assert.deepEqual([...s].sort(), ['b', 'c', 'd']);
  s = nextSelection(new Set(['d']), five, 'a', 'd', true);
  assert.deepEqual([...s].sort(), ['a', 'b', 'c', 'd']);
});

test('shift-click adds to an existing selection rather than replacing it', () => {
  const s = nextSelection(new Set(['a']), five, 'e', 'd', true);
  assert.deepEqual([...s].sort(), ['a', 'd', 'e']);
});

test('shift-click with no anchor behaves as a plain click', () => {
  const s = nextSelection(new Set(), five, 'c', null, true);
  assert.deepEqual([...s], ['c']);
});

test('pruneSelection drops ids that no longer exist', () => {
  const s = pruneSelection(new Set(['a', 'c', 'zzz']), five);
  assert.deepEqual([...s].sort(), ['a', 'c']);
});

/* ------------------------------------------------------------------ *
 * Bulk edit
 * ------------------------------------------------------------------ */

test('applyBulkPatch writes only the fields in the patch, only to selected rows', () => {
  const rows = [
    row({ playerNameAsPrinted: 'A', jerseySize: 'L', sockSize: 'Senior' }),
    row({ playerNameAsPrinted: 'B', jerseySize: 'M', sockSize: 'Senior' }),
    row({ playerNameAsPrinted: 'C', jerseySize: 'S', sockSize: 'Junior' }),
  ];
  const out = applyBulkPatch(rows, new Set([rows[0].id, rows[2].id]), { sockSize: 'Intermediate' });
  assert.equal(out[0].sockSize, 'Intermediate');
  assert.equal(out[1].sockSize, 'Senior');
  assert.equal(out[2].sockSize, 'Intermediate');
  // jersey sizes untouched
  assert.deepEqual(out.map((r) => r.jerseySize), ['L', 'M', 'S']);
  // untouched row is the same object, so React sees no change there
  assert.equal(out[1], rows[1]);
});

test('applyBulkPatch: an explicit empty string IS a write (that is how "clear" is spelled)', () => {
  const rows = [row({ number: '9' })];
  const out = applyBulkPatch(rows, new Set(ids(rows)), { number: '' });
  assert.equal(out[0].number, '');
});

test('applyBulkPatch: an empty patch or empty selection returns the same array', () => {
  const rows = [row(), row()];
  assert.equal(applyBulkPatch(rows, new Set(ids(rows)), {}), rows);
  assert.equal(applyBulkPatch(rows, new Set(), { number: '1' }), rows);
});

test('applyBulkPatch never puts a jersey on a sock-only row', () => {
  const rows = [row({ sockOnly: true, jerseySize: '' }), row({ jerseySize: 'M' })];
  const out = applyBulkPatch(rows, new Set(ids(rows)), { jerseySize: 'L', homeJersey: 1, noName: true, sockSize: 'Senior' });
  assert.equal(out[0].jerseySize, '');
  assert.equal(out[0].homeJersey, 0);
  assert.equal(out[0].noName, false);
  assert.equal(out[0].sockSize, 'Senior'); // socks are fine
  assert.equal(out[1].jerseySize, 'L');
});

test('applyBulkPatch: a jersey size for one cut is not written to the other', () => {
  const rows = [row({ isGoalie: true, jerseySize: 'Goalie L' }), row({ jerseySize: 'M' })];
  const out = applyBulkPatch(rows, new Set(ids(rows)), { jerseySize: 'XL' }, /* forGoalies */ false);
  assert.equal(out[0].jerseySize, 'Goalie L'); // goalie untouched
  assert.equal(out[1].jerseySize, 'XL');
});

test('selectionCut reports skaters, goalies, mixed, none', () => {
  const rows = [row({ isGoalie: true }), row(), row({ sockOnly: true })];
  assert.equal(selectionCut(rows, new Set([rows[0].id])), 'goalies');
  assert.equal(selectionCut(rows, new Set([rows[1].id])), 'skaters');
  assert.equal(selectionCut(rows, new Set([rows[0].id, rows[1].id])), 'mixed');
  assert.equal(selectionCut(rows, new Set([rows[2].id])), 'none'); // sock-only has no cut
  assert.equal(selectionCut(rows, new Set()), 'none');
});

/* ------------------------------------------------------------------ *
 * Size breakdown
 * ------------------------------------------------------------------ */

test('sizeBreakdown counts in the list\'s order and reports blanks', () => {
  const { buckets, missing } = sizeBreakdown(['L', 'M', '', 'L', 'XL', ' ', 'M', 'L'], ['S', 'M', 'L', 'XL']);
  assert.deepEqual(buckets, [{ size: 'M', count: 2 }, { size: 'L', count: 3 }, { size: 'XL', count: 1 }]);
  assert.equal(missing, 2);
});

test('sizeBreakdown keeps an off-list size rather than losing it', () => {
  const { buckets } = sizeBreakdown(['L', 'Goalie XL'], ['S', 'M', 'L']);
  assert.deepEqual(buckets, [{ size: 'L', count: 1 }, { size: 'Goalie XL', count: 1 }]);
});

/* ------------------------------------------------------------------ *
 * Shared value (what the bulk bar shows)
 * ------------------------------------------------------------------ */

test('sharedValue: the common value, MIXED when rows disagree, undefined when none selected', async () => {
  const { sharedValue, MIXED } = await import('@/lib/roster-edit');
  const rows = [row({ jerseySize: 'L' }), row({ jerseySize: 'L' }), row({ jerseySize: 'M' })];
  assert.equal(sharedValue(rows, new Set([rows[0].id, rows[1].id]), 'jerseySize'), 'L');
  assert.equal(sharedValue(rows, new Set(ids(rows)), 'jerseySize'), MIXED);
  assert.equal(sharedValue(rows, new Set(), 'jerseySize'), undefined);
});
