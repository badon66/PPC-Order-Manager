import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGrid } from '@/lib/roster-import/analyze';
import { noAnswers, teamFill } from '@/lib/roster-import/team';
import type { ImportContext } from '@/lib/roster-import/build';
import type { AiGuess } from '@/lib/roster-import/types';
import { blankOrder } from '@/lib/order-utils';

const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  orderMode: 'single_set',
  sets: [{ ...blankOrder().sets[0], playerJerseys: 3, goalieJerseys: 1, sockPairs: 4, pantShells: 0 }],
  includesSocks: true, includesPantShells: false, nameStyle: 'name_bars', teamName: 'Hawks', ...over,
});

const grid = (rows: string[][], ai: Array<AiGuess['field'] | null>, over = {}) => {
  const a = analyzeGrid({ fileName: 'roster.pdf', fileUrl: 'artwork/x.pdf', kind: 'pdf', how: 't', rows, headerRow: 0, ...over });
  return { ...a, ai: ai.map((f) => (f ? { field: f, why: '' } : null)) };
};

test('a clean file fills the rows with nothing to ask', () => {
  const a = grid(
    [['Name', 'Number', 'Jersey Size', 'Sock Size'], ['SMITH', '12', 'Adult L', 'Adult L'], ['CHEN', '7', 'Youth L', 'Small']],
    ['name', 'number', 'jerseySize', 'sockSize'],
  );
  const f = teamFill(a, ctx(), noAnswers());
  assert.deepEqual(f.questions, []);
  assert.equal(f.players[0].playerNameAsPrinted, 'SMITH');
  assert.equal(f.players[0].jerseySize, 'Senior Large');
  assert.equal(f.players[0].sockSize, 'Large');
  assert.equal(f.players[1].jerseySize, 'Youth L/XL');
  assert.deepEqual(f.flags, [[], []]);
});

test('a column the AI and the heading disagree on is asked, and fills nothing until answered', () => {
  const a = grid([['Name', 'Size'], ['SMITH', 'L'], ['CHEN', 'M']], ['name', 'jerseySize']);
  const asked = teamFill(a, ctx(), noAnswers());
  const q = asked.questions.find((x) => x.kind === 'column');
  assert.ok(q && q.kind === 'column' && q.col === 1);
  assert.ok(q.kind === 'column' && q.options.includes('sockSize'));
  assert.ok(q.kind === 'column' && !q.options.includes('name'), "a field already taken by another column isn't offered");
  assert.equal(asked.players[0].jerseySize, '');

  const answered = teamFill(a, ctx(), { ...noAnswers(), columns: { 1: 'jerseySize' } });
  assert.ok(answered.questions.some((x) => x.kind === 'bare'), 'plain S/M/L: youth or adult is asked next');
  const done = teamFill(a, ctx(), { ...noAnswers(), columns: { 1: 'jerseySize' }, bare: { 1: 'senior' } });
  assert.deepEqual(done.questions, []);
  assert.equal(done.players[0].jerseySize, 'Senior Large');
});

test('full names: which part goes on the back is asked, with their own first name as the example', () => {
  const a = grid([['Player', '#'], ['John Smith', '12'], ['Ava Chen', '7']], ['fullName', 'number']);
  const f = teamFill(a, ctx(), noAnswers());
  const q = f.questions.find((x) => x.kind === 'nameFormat');
  assert.ok(q && q.kind === 'nameFormat');
  assert.deepEqual(q.examples, { last: 'Smith', full: 'John Smith', first: 'John' });
  assert.equal(teamFill(a, ctx(), { ...noAnswers(), nameFormat: 'last' }).players[1].playerNameAsPrinted, 'Chen');
});

test('a cell the two readings disagreed on is left blank and marked — never one reading picked', () => {
  const a = grid([['Name', 'Number'], ['SMITH', '17'], ['CHEN', '7']], ['name', 'number'], {
    disputes: [{ row: 1, col: 1, readings: ['17', '12'] }],
  });
  const f = teamFill(a, ctx(), noAnswers());
  assert.equal(f.players[0].number, '');
  assert.equal(f.flags[0][0].field, 'number');
  assert.match(f.flags[0][0].message, /"17" or "12"/);
});

test("a size the table can't translate is left blank, with what their file said", () => {
  const a = grid([['Name', 'Jersey Size'], ['SMITH', '48'], ['TREMBLAY', 'Goalie']], ['name', 'jerseySize']);
  const f = teamFill(a, ctx(), noAnswers());
  assert.equal(f.players[0].jerseySize, '');
  assert.deepEqual(f.flags[0], [{ field: 'jerseySize', message: 'Your file says "48" — pick the jersey size that matches.' }]);
});

test('coach and total lines are left out, and listed so the team can see', () => {
  const a = grid([['Name', 'Number'], ['SMITH', '12'], ['Coach: Dave Roy', ''], ['Total', '1']], ['name', 'number']);
  const f = teamFill(a, ctx(), noAnswers());
  assert.equal(f.players.length, 1);
  assert.deepEqual(f.leftOut, ['Coach: Dave Roy', 'Total · 1']);
});

test('no socks on the order: no sock sizes and no socks-only rows come through', () => {
  const a = grid([['Name', 'Jersey Size', 'Sock Size'], ['SMITH', 'Adult L', 'Adult L']], ['name', 'jerseySize', 'sockSize']);
  const f = teamFill(a, ctx({ includesSocks: false, sets: [{ ...blankOrder().sets[0], playerJerseys: 1, goalieJerseys: 0 }] }), noAnswers());
  assert.equal(f.players[0].sockSize, '');
});
