import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromColumns, reconcile, type Reading } from '@/lib/roster-import/reconcile';

const rowsReading = (rows: string[][], fields = ['fullName', 'number', 'jerseySize'] as Reading['fields']): Reading => ({
  headers: ['Player', '#', 'Size'], rows, fields, otherText: [],
});

const byColumns = (rows: string[][], fields = ['fullName', 'number', 'jerseySize'] as Reading['fields']) =>
  fromColumns(
    ['Player', '#', 'Size'].map((h, c) => ({ header: h, field: fields[c] ?? null, cells: rows.map((r) => r[c]) })),
    [],
  );

test('two readings that agree: no disputes, header kept, AI labels kept', () => {
  const data = [['John Smith', '12', 'L'], ['Ava Chen', '7', 'M']];
  const r = reconcile([rowsReading(data), byColumns(data)]);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.headerRow, 0);
  assert.deepEqual(r.rows[1], ['John Smith', '12', 'L']);
  assert.deepEqual(r.disputes, []);
  assert.equal(r.ai[2]?.field, 'jerseySize');
  assert.match(r.note, /every cell matched/);
});

test('a cell the readings disagree on becomes a dispute with both readings', () => {
  const a = [['John Smith', '12', 'L'], ['Ava Chen', '7', 'M']];
  const b = [['John Smith', '17', 'L'], ['Ava Chen', '7', 'M']];
  const r = reconcile([rowsReading(a), byColumns(b)]);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.disputes, [{ row: 1, col: 1, readings: ['12', '17'] }]);
});

test('spacing and case are not disagreements; illegible cells always are', () => {
  const r = reconcile([rowsReading([['John  Smith', '12', 'l']]), byColumns([['john smith', '12', 'L']])]);
  assert.ok(r.ok && r.disputes.length === 0);
  const q = reconcile([rowsReading([['J?? Smith', '12', 'L']]), byColumns([['J?? Smith', '12', 'L']])]);
  assert.ok(q.ok && q.disputes.length === 1, 'two readings agreeing on "can\'t read it" is still unreadable');
});

test('a different number of rows: no answer from two readings, settled by a third', () => {
  const full = [['John Smith', '12', 'L'], ['Ava Chen', '7', 'M']];
  const missed = [['John Smith', '12', 'L']];
  const two = reconcile([rowsReading(full), byColumns(missed)]);
  assert.equal(two.ok, false);
  const three = reconcile([rowsReading(full), byColumns(missed), rowsReading(full)]);
  assert.ok(three.ok);
  if (three.ok) assert.equal(three.rows.length, 3);
});

test('with three readings, two out of three settles a cell', () => {
  const a = [['John Smith', '12', 'L']];
  const b = [['John Smith', '17', 'L']];
  const r = reconcile([rowsReading(a), rowsReading(b), rowsReading(a)]);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.rows[1][1], '12');
  assert.equal(r.disputes.length, 0);
  assert.match(r.note, /two readings out of three/);
});

test('uneven columns in the column-by-column reading are caught, not padded', () => {
  const cols = fromColumns([
    { header: 'Player', field: 'fullName', cells: ['John Smith', 'Ava Chen'] },
    { header: '#', field: 'number', cells: ['12'] },
  ], []);
  const rowsR: Reading = { headers: ['Player', '#'], rows: [['John Smith', '12'], ['Ava Chen', '7']], fields: ['fullName', 'number'], otherText: [] };
  assert.equal(reconcile([rowsR, cols]).ok, false);
});

test('when the readings label a column differently, it gets no AI opinion', () => {
  const data = [['John Smith', '12', 'L']];
  const r = reconcile([rowsReading(data, ['fullName', 'number', 'jerseySize']), byColumns(data, ['fullName', 'number', 'sockSize'])]);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.ai[2], null);
    assert.equal(r.ai[1]?.field, 'number');
  }
});

test('header text the readings disagree on marks the column unsure', () => {
  const a: Reading = { headers: ['Player', '#', 'Sock'], rows: [['A B', '1', 'L']], fields: ['fullName', 'number', 'sockSize'], otherText: ['Sizes are adult'] };
  const b: Reading = { headers: ['Player', '#', 'Pant'], rows: [['A B', '1', 'L']], fields: ['fullName', 'number', 'sockSize'], otherText: ['Sizes are adult'] };
  const r = reconcile([a, b]);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.unsureColumns, [2]);
    assert.deepEqual(r.otherText, ['Sizes are adult']);
  }
});
