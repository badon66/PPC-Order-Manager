import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectHeaderRow, headerGuess, isPowerplayCsv, ourCsvGuesses, ruleGuess, suggestNotPlayers } from '@/lib/roster-import/columns';
import { CSV_COLUMNS } from '@/lib/constants';

const g = (header: string, values: string[]) => ruleGuess(header, values);
const names = ['John Smith', 'Liam O\'Neil', 'Noah Tremblay', 'Ava Chen'];
const nums = ['12', '7', '00', '33'];
const sizes = ['L', 'M', 'XL', 'S'];

test('the garment comes from the header, never from the values', () => {
  assert.deepEqual(g('Sock Size', sizes).field, 'sockSize');
  assert.deepEqual(g('Socks', sizes).field, 'sockSize');
  assert.deepEqual(g('Pant Shell', sizes).field, 'pantSize');
  assert.deepEqual(g('Breezers', sizes).field, 'pantSize');
  assert.deepEqual(g('Jersey Size', sizes).field, 'jerseySize');
  assert.equal(g('Jersey Size', sizes).confidence, 'high');
  // A bare "Size" column is a size — but of what? Never assumed.
  assert.equal(g('Size', sizes).field, 'sizeUnknown');
  assert.equal(g('', sizes).field, 'sizeUnknown');
  assert.equal(g('Size 2', sizes).field, 'sizeUnknown');
});

test('"Jersey" alone: the values decide between the number and the size', () => {
  assert.equal(g('Jersey', nums).field, 'number');
  assert.equal(g('Jersey', sizes).field, 'jerseySize');
  assert.equal(g('Jersey #', nums).field, 'number');
  assert.equal(g('Jersey #', nums).confidence, 'high');
});

test('a position column is never read as captain letters — C there is centre', () => {
  const r = g('Pos', ['C', 'F', 'D', 'G', 'LW']);
  assert.equal(r.field, 'position');
  const noHeader = g('', ['C', 'F', 'D', 'G', 'D', 'F']);
  assert.equal(noHeader.field, 'position');
  assert.equal(g('C/A', ['C', '', '', 'A', '', '', 'A', '']).field, 'letter');
  assert.equal(g('', ['C', '', '', 'A', '', '', '', '']).field, 'letter');
});

test('names: full names are high confidence, single words are a question', () => {
  assert.equal(g('Player', names).field, 'fullName');
  assert.equal(g('Player', names).confidence, 'high');
  const single = g('Player', ['Jake', 'Liam', 'Noah', 'Owen']);
  assert.equal(single.field, 'name');
  assert.equal(single.confidence, 'low', 'first names or last names: the rules cannot tell');
  assert.equal(g('Name on Back', ['SMITH', 'CHEN']).field, 'name');
  assert.equal(g('First Name', ['Jake', 'Liam']).field, 'firstName');
  assert.equal(g('Last Name', ['Smith', 'Chen']).field, 'lastName');
  assert.equal(g('Player', ['Smith #12', '#7 Chen', 'Tremblay 33']).field, 'nameAndNumber');
});

test('contact columns are ignored, even with a # in the header', () => {
  assert.equal(g('Parent Phone #', ['403-555-1234', '403 555 9876']).field, 'ignore');
  assert.equal(g('Email', ['a@b.ca']).field, 'ignore');
  assert.equal(g('DOB', ['2014-03-02']).field, 'ignore');
});

test('a header the values contradict is low confidence', () => {
  const r = g('Number', names);
  assert.equal(r.field, 'number');
  assert.equal(r.confidence, 'low');
});

test('no header at all: read from the values', () => {
  assert.equal(g('', nums).field, 'number');
  assert.equal(g('', names).field, 'fullName');
  assert.equal(g('', ['24"', '26"', '24"']).field, 'sockSize');
  assert.equal(g('', []).field, 'ignore');
});

test('headerGuess: unknown headers say nothing', () => {
  assert.equal(headerGuess('Favourite colour'), null);
  assert.equal(headerGuess('')?.field, undefined);
});

test('detectHeaderRow: skips titles and blank lines', () => {
  const rows = [
    ['Spring Hawks 2026', '', ''],
    ['', '', ''],
    ['Player', '#', 'Jersey Size'],
    ['John Smith', '12', 'L'],
  ];
  assert.equal(detectHeaderRow(rows), 2);
  assert.equal(detectHeaderRow([['John Smith', '12', 'L'], ['Ava Chen', '7', 'M']]), -1);
});

test('suggestNotPlayers: staff and total lines are flagged, players are not', () => {
  const rows = [
    ['Player', '#'],
    ['John Smith', '12'],
    ['Coach: Dave Miller', ''],
    ['Total', '18'],
    ['', ''],
    ['Ava Chen', '7'],
  ];
  assert.deepEqual(suggestNotPlayers(rows, 0), [2, 3]);
});

test('our own export is recognised, column for column', () => {
  assert.equal(isPowerplayCsv([...CSV_COLUMNS]), true);
  assert.equal(isPowerplayCsv(['Player', '#', 'Size']), false);
  const guesses = ourCsvGuesses([...CSV_COLUMNS]);
  assert.deepEqual(guesses.map((x) => x.field).slice(0, 7), ['name', 'number', 'goalie', 'letter', 'jerseySize', 'sockSize', 'pantSize']);
  assert.ok(guesses.every((x) => x.confidence === 'high'));
});

test('Quebec rosters: French headings are read like English ones', () => {
  const f = (h: string) => headerGuess(h)?.field;
  assert.equal(f('Grandeur chandail'), 'jerseySize');
  assert.equal(f('Grandeur bas'), 'sockSize');
  assert.equal(f('Culotte'), 'pantSize');
  assert.equal(f('Numéro'), 'number');
  assert.equal(f('Prénom'), 'firstName');
  assert.equal(f('Nom de famille'), 'lastName');
  assert.equal(f('Nom au dos'), 'name');
  assert.equal(f('Gardien'), 'goalie');
  assert.equal(f('Capitaine'), 'letter');
  assert.equal(f('Courriel du parent'), 'ignore');
  assert.equal(f('Taille'), 'sizeUnknown');
});
