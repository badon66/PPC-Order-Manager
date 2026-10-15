import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanAnalysis, cleanDecisions } from '@/lib/roster-import/validate';
import { analyzeGrid } from '@/lib/roster-import/analyze';
import { buildImport } from '@/lib/roster-import/build';
import { blankOrder } from '@/lib/order-utils';

/* What comes back from the browser on Accept is checked before the server rebuilds from it. */

const good = analyzeGrid({
  fileName: 'roster.csv', fileUrl: 'artwork/1b2c.csv', kind: 'csv', how: 'test',
  rows: [['Name', 'Number', 'Jersey Size'], ['SMITH', '12', 'Adult L'], ['CHEN', '7', 'Adult M']],
});

test('a real analysis survives the round trip unchanged', () => {
  const back = cleanAnalysis(JSON.parse(JSON.stringify(good)));
  assert.deepEqual(back, good);
});

test('a damaged analysis is refused outright', () => {
  assert.equal(cleanAnalysis(null), null);
  assert.equal(cleanAnalysis({ ...good, version: 2 }), null);
  assert.equal(cleanAnalysis({ ...good, kind: 'exe' }), null);
  assert.equal(cleanAnalysis({ ...good, rows: 'SMITH,12' }), null);
  assert.equal(cleanAnalysis({ ...good, rows: [['a'], 'b'] }), null);
  assert.equal(cleanAnalysis({ ...good, headerRow: 9 }), null);
  assert.equal(cleanAnalysis({ ...good, rows: Array.from({ length: 700 }, () => ['x']) }), null);
});

test('odd parts are dropped, not trusted: a foreign file URL, unknown fields, bad disputes', () => {
  const a = cleanAnalysis({
    ...good,
    fileUrl: 'https://evil.example/x.pdf',
    rules: [{ field: 'shoeSize', confidence: 'certain', why: 1 }, ...good.rules.slice(1)],
    ai: [{ field: 'jerseysQty', why: '' }, { field: 'number', why: 'n' }],
    disputes: [{ row: 99, col: 0, readings: ['a'] }, { row: 1, col: 1, readings: ['12', '17'] }],
  })!;
  assert.equal(a.fileUrl, '');
  assert.deepEqual(a.rules[0], { field: 'ignore', confidence: 'low', why: '' });
  assert.equal(a.ai?.[0], null, 'the AI can never claim one of our CSV-only fields');
  assert.equal(a.ai?.[1]?.field, 'number');
  assert.deepEqual(a.disputes, [{ row: 1, col: 1, readings: ['12', '17'] }]);
});

test('decisions: only well-formed answers are kept', () => {
  const d = cleanDecisions({
    columns: { 0: 'name', 1: 'bogus', 9: 'number' },
    nameFormat: 'middle',
    bare: { 2: 'senior', 1: 'giant' },
    values: { 'jerseySize|p|48': 'Senior XL' },
    excluded: [1, 50, 'x'],
    disputes: { '1:1': '12', 'x': 'y' },
    acknowledged: ['count-under', 7],
    edits: { 1: { name: 'SMYTHE', isGoalie: 'yes', captaincy: 'Z' }, 9: { name: 'nobody' } },
  }, good);
  assert.deepEqual(d.columns, { 0: 'name' });
  assert.equal(d.nameFormat, null);
  assert.deepEqual(d.bare, { 2: 'senior' });
  assert.deepEqual(d.values, { 'jerseySize|p|48': 'Senior XL' });
  assert.deepEqual(d.excluded, [1]);
  assert.deepEqual(d.disputes, { '1:1': '12' });
  assert.deepEqual(d.acknowledged, ['count-under']);
  assert.deepEqual(d.edits, { 1: { name: 'SMYTHE' } });
});

test('the server rebuilds the same roster from the cleaned copy', () => {
  const ctx = {
    orderMode: 'single_set' as const,
    sets: [{ ...blankOrder().sets[0], playerJerseys: 2, goalieJerseys: 0 }],
    includesSocks: false, includesPantShells: false, nameStyle: 'name_bars' as const, teamName: 'x',
  };
  const decisions = { columns: {}, nameFormat: null, bare: {}, values: {}, excluded: [], included: [], disputes: {}, acknowledged: [], edits: {} };
  const onScreen = buildImport(good, decisions, ctx);
  const onServer = buildImport(cleanAnalysis(JSON.parse(JSON.stringify(good)))!, cleanDecisions(JSON.parse(JSON.stringify(decisions)), good), ctx);
  assert.deepEqual(onServer, onScreen);
});
