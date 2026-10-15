import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildImport, pickName, splitNameAndNumber, stripMarkers, toRosterEntries, type ImportContext } from '@/lib/roster-import/build';
import { detectHeaderRow, ourCsvGuesses, ruleGuess, suggestNotPlayers } from '@/lib/roster-import/columns';
import { emptyDecisions, type AiGuess, type ImportAnalysis, type ImportDecisions } from '@/lib/roster-import/types';
import { blankOrder } from '@/lib/order-utils';
import type { SetQuantities } from '@/lib/types';

function sets(players: number, goalies: number, socks = 0, shells = 0): SetQuantities[] {
  return [{ ...blankOrder().sets[0], playerJerseys: players, goalieJerseys: goalies, sockPairs: socks, pantShells: shells }];
}

function ctx(over: Partial<ImportContext> = {}): ImportContext {
  return {
    orderMode: 'single_set', sets: sets(3, 1, 4, 4), includesSocks: true, includesPantShells: true,
    nameStyle: 'name_bars', teamName: 'Hawks', ...over,
  };
}

/** An analysis from a grid, the way the reader builds one: rules on every column, AI optional. */
function analysis(rows: string[][], ai: Array<AiGuess['field'] | null> | null = null, over: Partial<ImportAnalysis> = {}): ImportAnalysis {
  const headerRow = detectHeaderRow(rows);
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const data = rows.slice(headerRow + 1);
  return {
    version: 1, fileName: 'roster.csv', fileUrl: 'k', kind: 'csv', how: 'test',
    rows, headerRow, numericCells: [], disputes: [],
    rules: Array.from({ length: width }, (_, c) => ruleGuess(headerRow >= 0 ? rows[headerRow][c] : '', data.map((r) => r[c] ?? ''))),
    ai: ai ? ai.map((f) => (f ? { field: f, why: 'ai' } : null)) : null,
    notPlayerRows: suggestNotPlayers(rows, headerRow),
    sizeSuggestions: {}, aiNote: null, otherText: [], otherSheets: [], ...over,
  };
}

const d = (over: Partial<ImportDecisions> = {}): ImportDecisions => ({ ...emptyDecisions(), ...over });

/* The example Keenan gave: their columns are jersey, PANTS, socks — ours are jersey, socks, pants. */
const flipped = [
  ['Player', '#', 'Jersey Size', 'Pant Size', 'Sock Size'],
  ['John Smith', '12', 'Adult L', 'Adult M', 'Adult XL'],
  ['Ava Chen', '7', 'Adult M', 'Adult S', 'Adult L'],
  ['Noah Tremblay', '33', 'Goalie L', 'Goalie', 'Adult L'],
];

test("Keenan's example: flipped garment columns land in the right places", () => {
  const a = analysis(flipped, ['fullName', 'number', 'jerseySize', 'pantSize', 'sockSize']);
  const r = buildImport(a, d({ nameFormat: 'last', acknowledged: ['count-under'] }), ctx());
  const smith = r.rows.find((x) => x.number === '12')!;
  assert.equal(smith.name, 'Smith');
  assert.equal(smith.jerseySize, 'Senior Large');
  assert.equal(smith.pantShellSize, 'Senior Medium', 'the PANT column, not the third column');
  assert.equal(smith.sockSize, 'XL', 'the SOCK column, not the fourth');
  const goalie = r.rows.find((x) => x.number === '33')!;
  assert.equal(goalie.isGoalie, true);
  assert.equal(goalie.jerseySize, 'Goalie L');
  assert.equal(goalie.pantShellSize, 'Senior Goalie');
  assert.equal(r.issues.filter((i) => i.level === 'block').length, 0);
  assert.equal(r.ready, true);
});

test('when the rules and the AI disagree about a column, nothing from it is used until a person picks', () => {
  // The AI got the sock and pant columns the wrong way round.
  const a = analysis(flipped, ['fullName', 'number', 'jerseySize', 'sockSize', 'pantSize']);
  const r = buildImport(a, d({ nameFormat: 'last' }), ctx());
  assert.equal(r.ready, false);
  assert.ok(r.issues.some((i) => i.id === 'col:3' && i.level === 'block'));
  assert.ok(r.issues.some((i) => i.id === 'col:4' && i.level === 'block'));
  assert.ok(r.rows.every((x) => x.pantShellSize === '' && x.sockSize === ''), 'open columns contribute nothing');
  const fixed = buildImport(a, d({ nameFormat: 'last', columns: { 3: 'pantSize', 4: 'sockSize' }, acknowledged: ['count-under'] }), ctx());
  assert.equal(fixed.ready, true);
  assert.equal(fixed.rows[0].pantShellSize, 'Senior Medium');
});

test('size columns with no garment in the header always need a person', () => {
  const rows = [
    ['Name', 'Number', 'Size', 'Size', 'Size'],
    ['John Smith', '12', 'L', 'M', 'XL'],
  ];
  const a = analysis(rows, ['fullName', 'number', 'jerseySize', 'sockSize', 'pantSize']);
  const r = buildImport(a, d({ nameFormat: 'last' }), ctx());
  for (const c of [2, 3, 4]) assert.ok(r.issues.some((i) => i.id === `col:${c}`), `column ${c} is a question`);
});

test('on a jerseys-only order, the one size column is the jersey size', () => {
  const rows = [['Name', 'Number', 'Size'], ['John Smith', '12', 'Adult L']];
  const a = analysis(rows, ['fullName', 'number', 'jerseySize']);
  const r = buildImport(a, d({ nameFormat: 'last' }), ctx({ includesSocks: false, includesPantShells: false, sets: sets(1, 0) }));
  assert.equal(r.columns[2].status, 'agreed');
  assert.equal(r.rows[0].jerseySize, 'Senior Large');
});

test('no AI: high-confidence rules stand, anything weaker is a question', () => {
  const r = buildImport(analysis(flipped, null), d({ nameFormat: 'last', acknowledged: ['count-under'] }), ctx());
  assert.equal(r.columns[2].status, 'rules');
  assert.equal(r.ready, true);
  const loose = buildImport(analysis([['', ''], ['Jake', '12']].slice(1), null), d(), ctx());
  assert.ok(loose.issues.some((i) => i.id.startsWith('col:')), 'a bare column of single words is asked about');
});

test('bare letters: one decision per column, deduced only from youth markers in the same column', () => {
  const rows = [['Player', '#', 'Jersey Size'], ['A B', '1', 'L'], ['C D', '2', 'M']];
  const a = analysis(rows, ['fullName', 'number', 'jerseySize']);
  const r = buildImport(a, d({ nameFormat: 'last' }), ctx({ includesSocks: false, includesPantShells: false, sets: sets(2, 0) }));
  assert.ok(r.issues.some((i) => i.id === 'bare:2'));
  assert.deepEqual(r.needs.bare, [2]);
  assert.ok(r.rows.every((x) => x.jerseySize === ''), 'nothing guessed while the question is open');
  const youth = buildImport(a, d({ nameFormat: 'last', bare: { 2: 'youth' } }), ctx({ includesSocks: false, includesPantShells: false, sets: sets(2, 0) }));
  assert.deepEqual(youth.rows.map((x) => x.jerseySize), ['Youth L/XL', 'Youth S/M']);

  const marked = analysis([['Player', '#', 'Jersey Size'], ['A B', '1', 'YM'], ['C D', '2', 'L']], ['fullName', 'number', 'jerseySize']);
  const m = buildImport(marked, d({ nameFormat: 'last' }), ctx({ includesSocks: false, includesPantShells: false, sets: sets(2, 0) }));
  assert.deepEqual(m.rows.map((x) => x.jerseySize), ['Youth S/M', 'Senior Large']);
  assert.ok(m.issues.some((i) => i.id === 'bare-deduced:2' && i.level === 'info'));
});

test('an untranslatable size waits for a value decision that covers every row with it', () => {
  const rows = [['Player', '#', 'Sock Size'], ['A B', '1', '24"'], ['C D', '2', '24"'], ['E F', '3', 'L']];
  const a = analysis(rows, ['fullName', 'number', 'sockSize']);
  const r = buildImport(a, d({ nameFormat: 'last' }), ctx());
  const pending = r.needs.values.find((v) => v.raw === '24"')!;
  assert.equal(pending.count, 2);
  assert.ok(r.issues.some((i) => i.id === `value:${pending.key}`));
  const done = buildImport(a, d({ nameFormat: 'last', values: { [pending.key]: 'Large' } }), ctx());
  assert.deepEqual(done.rows.map((x) => x.sockSize), ['Large', 'Large', 'Large']);
  // A decision that isn't one of our sizes doesn't count.
  const bad = buildImport(a, d({ nameFormat: 'last', values: { [pending.key]: 'Huge' } }), ctx());
  assert.ok(bad.needs.values.some((v) => v.raw === '24"'));
});

test('a goalie listed with a plain size is asked, with the goalie cut suggested', () => {
  const rows = [['Player', '#', 'Pos', 'Jersey Size'], ['A B', '30', 'G', 'Adult L']];
  const a = analysis(rows, ['fullName', 'number', 'position', 'jerseySize']);
  const r = buildImport(a, d({ nameFormat: 'last' }), ctx());
  const p = r.needs.values[0];
  assert.equal(p.goalie, true);
  assert.equal(p.suggestion, 'Goalie L');
  assert.equal(r.rows[0].jerseySize, '');
});

test('names: format choice, markers, splitting, and the ones worth a second look', () => {
  assert.deepEqual(pickName('Smith, John', 'last'), { value: 'Smith', unsure: false });
  assert.deepEqual(pickName('John Smith', 'full'), { value: 'John Smith', unsure: false });
  assert.deepEqual(pickName('Smith, John', 'full'), { value: 'John Smith', unsure: false });
  assert.equal(pickName('John Van Dyke', 'last').unsure, true);
  assert.equal(pickName('John Smith Jr.', 'last').value, 'Smith Jr.');
  assert.deepEqual(stripMarkers('SMITH (C)'), { name: 'SMITH', captaincy: 'C', goalie: false });
  assert.deepEqual(stripMarkers('Chen [g]'), { name: 'Chen', captaincy: '', goalie: true });
  assert.deepEqual(splitNameAndNumber('Smith #12'), { name: 'Smith', number: '12' });
  assert.deepEqual(splitNameAndNumber('#7 Chen'), { name: 'Chen', number: '7' });
  assert.deepEqual(splitNameAndNumber('12 - John Smith'), { name: 'John Smith', number: '12' });
  assert.equal(splitNameAndNumber('Smith'), null);

  const rows = [['Player', '#'], ['John Smith', '12'], ['Ava Chen', '7']];
  const a = analysis(rows, ['fullName', 'number']);
  const open = buildImport(a, d(), ctx());
  assert.ok(open.issues.some((i) => i.id === 'nameformat'));
  assert.equal(open.needs.nameFormat, true);
});

test('position C is centre, never captain; the letter column is the only source of C/A', () => {
  const rows = [['Player', '#', 'Pos', 'C/A'], ['A B', '9', 'C', ''], ['C D', '4', 'D', 'A']];
  const a = analysis(rows, ['fullName', 'number', 'position', 'letter']);
  const r = buildImport(a, d({ nameFormat: 'last' }), ctx());
  assert.equal(r.rows[0].captaincy, '');
  assert.equal(r.rows[1].captaincy, 'A');
});

test('numbers: bad ones block, Excel zero is confirmed, duplicates are confirmed', () => {
  const rows = [['Player', '#'], ['A B', '12'], ['C D', '12'], ['E F', '123'], ['G H', '0']];
  const a = analysis(rows, ['fullName', 'number'], { numericCells: ['4:1'] });
  const r = buildImport(a, d({ nameFormat: 'last' }), ctx());
  assert.ok(r.issues.some((i) => i.id === 'num:3' && i.level === 'block'));
  assert.ok(r.issues.some((i) => i.id === 'zero:4' && i.level === 'confirm'));
  assert.ok(r.issues.some((i) => i.id === 'dup:12' && i.level === 'confirm'));
});

test('staff and total lines are left out but must be confirmed; a person can put one back', () => {
  const rows = [['Player', '#'], ['A B', '1'], ['Coach: Dave Miller', ''], ['Total', '1']];
  const a = analysis(rows, ['fullName', 'number']);
  const r = buildImport(a, d({ nameFormat: 'last' }), ctx());
  assert.equal(r.rows.length, 1);
  assert.ok(r.issues.some((i) => i.id === 'notplayer:2' && i.level === 'confirm'));
  assert.equal(r.ready, false);
  const back = buildImport(a, d({ nameFormat: 'last', included: [2] }), ctx());
  assert.equal(back.rows.length, 2);
});

test('PDF readings that disagree block the cell until a reading is picked', () => {
  const rows = [['Player', '#'], ['John Smith', '12']];
  const a = analysis(rows, ['fullName', 'number'], { disputes: [{ row: 1, col: 1, readings: ['12', '17'] }] });
  const r = buildImport(a, d({ nameFormat: 'last' }), ctx());
  assert.ok(r.issues.some((i) => i.id === 'dispute:1:1' && i.level === 'block'));
  const picked = buildImport(a, d({ nameFormat: 'last', disputes: { '1:1': '17' } }), ctx());
  assert.equal(picked.rows[0].number, '17');
  assert.ok(!picked.issues.some((i) => i.id.startsWith('dispute:')));
});

test('an edit on the preview replaces the value and clears that question; a bad edit blocks', () => {
  const rows = [['Player', '#', 'Jersey Size'], ['A B', 'x9', 'Adult L']];
  const a = analysis(rows, ['fullName', 'number', 'jerseySize']);
  const r = buildImport(a, d({ nameFormat: 'last', edits: { 1: { number: '9' } } }), ctx());
  assert.equal(r.rows[0].number, '9');
  assert.ok(!r.issues.some((i) => i.id === 'num:1'));
  const bad = buildImport(a, d({ nameFormat: 'last', edits: { 1: { jerseySize: 'Large-ish' } } }), ctx());
  assert.ok(bad.issues.some((i) => i.id === 'edit-size:1:jerseySize'));
});

test('two columns both set to the same field by a person is its own block', () => {
  const rows = [['Player', 'A', 'B'], ['A B', 'L', 'M']];
  const a = analysis(rows, ['fullName', 'jerseySize', 'jerseySize']);
  const r = buildImport(a, d({ nameFormat: 'last', columns: { 1: 'sockSize', 2: 'sockSize' } }), ctx());
  assert.ok(r.issues.some((i) => i.id === 'twice:sockSize'));
});

test('roster entries: sock column blank means no socks; no sock column means socks for everyone', () => {
  const rows = [['Player', '#', 'Jersey Size', 'Sock Size'], ['A B', '1', 'Adult L', 'L'], ['C D', '2', 'Adult M', '']];
  const a = analysis(rows, ['fullName', 'number', 'jerseySize', 'sockSize']);
  const c = ctx({ includesPantShells: false, sets: sets(2, 0, 2, 0) });
  const r = buildImport(a, d({ nameFormat: 'last' }), c);
  const e = toRosterEntries(r, c, 'o1', 'r9');
  assert.deepEqual(e.map((x) => x.socksPerPlayer), [1, 0]);
  assert.ok(e.every((x) => x.rosterId === 'r9' && x.jerseysPerPlayer === 1));

  const noSockCol = analysis([['Player', '#'], ['A B', '1']], ['fullName', 'number']);
  const r2 = buildImport(noSockCol, d({ nameFormat: 'last' }), c);
  assert.equal(toRosterEntries(r2, c, 'o1', 'r9')[0].socksPerPlayer, 1);
});

test('our own CSV comes back exactly, quantities and ticks included', () => {
  const rows = [
    ['Player Name', 'Number', 'Goalie', 'Letter', 'Jersey Size', 'Sock Size', 'Pant Size', 'Jerseys', 'Socks', 'Home Jersey', 'Away Jersey', 'Home Socks', 'Away Socks', 'Notes'],
    ['SMITH', '12', 'No', 'C', 'Senior Large', 'Large', '', '1', '1', '1', '1', '1', '0', 'needs it fast'],
    ['NO NAME', '30', 'Yes', '', 'Goalie L', 'Large', '', '1', '1', '1', '1', '1', '1', ''],
  ];
  const a = analysis(rows, null, { kind: 'powerplay-csv', rules: ourCsvGuesses(rows[0]) });
  const c = ctx({ orderMode: 'home_away_set', sets: [...sets(1, 1, 2, 0), ...sets(1, 1, 2, 0)], includesPantShells: false });
  const r = buildImport(a, d(), c);
  assert.equal(r.counts.block, 0);
  const e = toRosterEntries(r, c, 'o1', 'r1');
  assert.equal(e[0].playerNameAsPrinted, 'SMITH');
  assert.equal(e[0].captaincy, 'C');
  assert.equal(e[0].awaySocks, 0);
  assert.equal(e[1].noName, true);
  assert.equal(e[1].isGoalie, true);
  assert.equal(e[0].notes, 'needs it fast');
});

test('a garment the order does not include: its sizes are not asked about, and the gap is pointed out', () => {
  const rows = [
    ['Name', '#', 'Jersey Size', 'Pant Size', 'Sock Size'],
    ['SMITH', '12', 'Adult L', '34', 'Adult L'],
    ['CHEN', '7', 'Adult M', 'Adult S', 'Adult M'],
  ];
  const a = analysis(rows, ['name', 'number', 'jerseySize', 'pantSize', 'sockSize']);
  const r = buildImport(a, d({ acknowledged: ['count-under', 'goalie-count'] }), ctx({ includesPantShells: false }));
  assert.equal(r.issues.some((i) => i.id.startsWith('value:pantSize')), false, '"34" pants are never a question on an order with no pants');
  const gap = r.issues.find((i) => i.id === 'not-ordered:pantSize');
  assert.ok(gap && gap.level === 'confirm');
  assert.match(gap.message, /no pant shells/);
  assert.equal(r.rows[0].pantShellSize, '');
  assert.equal(r.ready, false, 'until someone has seen it');
  assert.equal(buildImport(a, d({ acknowledged: ['count-under', 'goalie-count', 'not-ordered:pantSize'] }), ctx({ includesPantShells: false })).ready, true);
});
