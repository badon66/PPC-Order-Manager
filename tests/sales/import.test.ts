import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCallListFile, contactsFromRows, scriptFromRows, cellText } from '@/lib/sales/import';

const NOW = '2026-09-06T20:00:00.000Z';
const opts = (fileName: string) => ({
  fileName, bytes: new Uint8Array(readFileSync(`tests/sales/fixtures/${fileName}`)),
  listId: 'list-1', listName: 'Sample', createdBy: 'Keenan Huber', now: NOW,
});

for (const fileName of ['sample-list.xlsx', 'sample-list.csv']) {
  test(`${fileName}: rows, skips, warnings, normalisation`, async () => {
    const r = await parseCallListFile(opts(fileName));
    assert.ok(r.ok, r.ok ? '' : r.error);
    if (!r.ok) return;
    const { list, contacts } = r;

    assert.equal(list.id, 'list-1');
    assert.equal(list.name, 'Sample');
    assert.equal(list.sourceFileName, fileName);
    assert.equal(contacts.length, 5);
    assert.equal(list.importReport.imported, 5);
    assert.deepEqual(list.importReport.skipped.map((s) => s.line), [4]);
    assert.match(list.importReport.skipped[0].reason, /no org and no phone/i);
    assert.match(list.importReport.skipped[0].raw, /Nobody Reachable/);

    const [eagles, kodiaks, dup, storm, lakers] = contacts;
    assert.equal(eagles.orgName, 'Ennismore Eagles');
    assert.equal(eagles.sortOrder, 1);
    assert.equal(eagles.listId, 'list-1');
    assert.ok(eagles.id.length > 10);
    assert.equal(eagles.teams, 14);
    assert.equal(eagles.players, 210);
    assert.equal(eagles.priority, 'A');
    assert.equal(eagles.doNotCall, false);
    assert.equal(eagles.raw['Rink'], 'Ennismore CC');
    assert.equal(eagles.raw['Org Name'], 'Ennismore Eagles');
    assert.equal(eagles.ageDivisions, 'U9, U11, U13');
    assert.equal(eagles.lastOrderedYear, '2023');
    assert.equal(kodiaks.altPhone, '250 555 0101');
    assert.equal(kodiaks.priority, 'B');
    assert.equal(dup.notes, 'duplicate of line 2');
    assert.equal(storm.province, 'SK');
    assert.equal(storm.orgType, 'MHA');
    assert.equal(storm.doNotCall, true);
    assert.equal(storm.priority, '');
    assert.equal(lakers.timezoneOverride, 'Central');
    assert.equal(lakers.teams, 1);

    const reasons = list.importReport.warnings.map((w) => `${w.line}:${w.reason}`).join('\n');
    assert.match(reasons, /^5:.*duplicate/im);
    assert.match(reasons, /^6:.*Org Type/im);
    assert.match(reasons, /^6:.*Do Not Call/im);
    assert.match(reasons, /^7:.*phone/im);
  });
}

test('xlsx carries the script; csv has none', async () => {
  const x = await parseCallListFile(opts('sample-list.xlsx'));
  const c = await parseCallListFile(opts('sample-list.csv'));
  assert.ok(x.ok && c.ok);
  if (!x.ok || !c.ok) return;
  assert.equal(x.list.script.length, 20);
  assert.equal(x.list.script[0].id, 's1');
  assert.equal(x.list.script[0].kind, 'reminder');
  assert.equal(x.list.script[6].kind, 'question');
  assert.equal(x.list.script[6].options.length, 6);
  assert.equal(x.list.script[4].showWhen, 'Org Type = Minor Hockey Association');
  assert.equal(x.list.script[12].response.length > 20, true);
  assert.equal(c.list.script.length, 0);
});

test('scriptFromRows: unknown kind/section or blank text is skipped and reported; bad Show When warns', () => {
  const r = scriptFromRows([
    ['Section', 'Kind', 'Text', 'Response', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5', 'Option 6', 'Show When'],
    ['Opening', 'Read', 'Hello', '', '', '', '', '', '', '', ''],
    ['Opening', 'Dance', 'Nope', '', '', '', '', '', '', '', ''],
    ['Opening', 'Read', '', '', '', '', '', '', '', '', ''],
    ['discovery', 'QUESTION', 'Q?', '', 'A', '', 'B', '', '', '', 'garbage rule'],
  ]);
  assert.deepEqual(r.items.map((i) => i.id), ['s1', 's2']);
  assert.deepEqual(r.items[1].options, ['A', 'B']);
  assert.equal(r.items[1].section, 'discovery');
  assert.deepEqual(r.skipped.map((s) => s.line), [3, 4]);
  assert.match(r.skipped[0].reason, /^Script:/);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.warnings[0].line, 5);
});

test('contactsFromRows: no recognisable header', () => {
  const r = contactsFromRows([['foo', 'bar'], ['1', '2']], 'l', NOW);
  assert.equal(r.contacts.length, 0);
  assert.equal(r.skipped.length, 1);
  assert.match(r.skipped[0].reason, /header/i);
});

test('cellText', () => {
  assert.equal(cellText(null), '');
  assert.equal(cellText(undefined), '');
  assert.equal(cellText(' x '), 'x');
  assert.equal(cellText(14), '14');
  assert.equal(cellText(true), 'TRUE');
  assert.equal(cellText(new Date(Date.UTC(2026, 8, 6))), '2026-09-06');
});

test('unsupported / empty files', async () => {
  const r1 = await parseCallListFile({ ...opts('sample-list.csv'), fileName: 'list.pdf' });
  assert.ok(!r1.ok);
  const r2 = await parseCallListFile({ ...opts('sample-list.csv'), bytes: new Uint8Array() });
  assert.ok(!r2.ok);
});
