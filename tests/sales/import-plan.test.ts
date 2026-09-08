import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CallList, Contact, ScriptItem } from '@/lib/types';
import { blankContact, blankCallList, healCallList, planImport, MAX_IMPORT_RECORDS } from '@/lib/data/sales-logic';

const NOW = '2026-09-08T20:00:00.000Z';
const list = (): CallList => blankCallList('l1', 'Youth', 'Keenan', '2026-09-01T00:00:00.000Z');
const c = (over: Partial<Contact> = {}): Contact => ({ ...blankContact('l1', 1, NOW), id: 'c1', orgName: 'Eagles', ...over });
const item: ScriptItem = { id: 's1', section: 'opening', kind: 'read', text: 'Hi', response: '', options: [], showWhen: '' };
const parsed = (contacts: Contact[], script: ScriptItem[] | null = null) => ({
  contacts, lines: contacts.map((_, i) => i + 2), script, skipped: [], warnings: [],
});
const plan = (existing: Contact[], rows: Contact[], extra: Partial<Parameters<typeof planImport>[0]> = {}) =>
  planImport({ list: list(), existing, others: [], parsed: parsed(rows), fileName: 'more.xlsx', by: 'Keenan', now: NOW, ...extra });

test('new rows are added with sortOrder after the existing ones', () => {
  const p = plan([c({ id: 'e1', sortOrder: 7, phone: '705 555 0001' })], [c({ id: 'r1', phone: '705 555 0002' }), c({ id: 'r2', phone: '705 555 0003' })]);
  assert.deepEqual(p.newContacts.map((x) => [x.id, x.sortOrder]), [['r1', 8], ['r2', 9]]);
  assert.equal(p.record.added, 2);
  assert.deepEqual(p.updatedContacts, []);
  assert.equal(p.list.imports.length, 1);
  assert.equal(p.list.imports[0], p.record);
  assert.equal(p.record.fileName, 'more.xlsx');
  assert.equal(p.record.by, 'Keenan');
  assert.equal(p.record.at, NOW);
  assert.equal(p.list.updatedAt, NOW);
});

test('a row matching an existing contact fills its blanks and is not added', () => {
  const existing = c({ id: 'e1', phone: '705 555 0001', email: '', callCount: 2 });
  const p = plan([existing], [c({ id: 'r1', phone: '(705) 555-0001', email: 'j@x.ca', city: 'Ennismore' })]);
  assert.equal(p.record.added, 0);
  assert.deepEqual(p.newContacts, []);
  assert.equal(p.updatedContacts.length, 1);
  assert.equal(p.updatedContacts[0].id, 'e1');
  assert.equal(p.updatedContacts[0].email, 'j@x.ca');
  assert.equal(p.updatedContacts[0].callCount, 2);
  assert.equal(p.updatedContacts[0].updatedAt, NOW);
  assert.deepEqual(p.record.merged, [{ line: 2, contactId: 'e1', filled: ['Email', 'City'] }]);
});

test('re-uploading the identical sheet adds nothing and merges with empty filled', () => {
  const existing = [c({ id: 'e1', phone: '705 555 0001', email: 'a@x.ca' }), c({ id: 'e2', sortOrder: 2, phone: '705 555 0002' })];
  const p = plan(existing, [c({ id: 'r1', phone: '705 555 0001', email: 'a@x.ca' }), c({ id: 'r2', phone: '705 555 0002' })]);
  assert.equal(p.record.added, 0);
  assert.deepEqual(p.record.merged.map((m) => [m.contactId, m.filled]), [['e1', []], ['e2', []]]);
  assert.deepEqual(p.updatedContacts, [], 'nothing changed, nothing to write');
});

test('two matching rows in one upload become one contact', () => {
  const p = plan([], [c({ id: 'r1', phone: '705 555 0001', email: '' }), c({ id: 'r2', phone: '1-705-555-0001', email: 'j@x.ca' })]);
  assert.equal(p.record.added, 1);
  assert.equal(p.newContacts.length, 1);
  assert.equal(p.newContacts[0].email, 'j@x.ca');
  assert.deepEqual(p.record.merged, [{ line: 3, contactId: 'r1', filled: ['Email'] }]);
});

test('a match in another list is added here and listed under alsoIn; deleted lists ignored', () => {
  const beer = blankCallList('l2', 'Beer league', 'Keenan', NOW);
  const gone = { ...blankCallList('l3', 'Old', 'Keenan', NOW), deletedAt: NOW };
  const others = [
    { list: beer, contacts: [c({ id: 'b1', listId: 'l2', phone: '705 555 0001' })] },
    { list: gone, contacts: [c({ id: 'g1', listId: 'l3', phone: '705 555 0001' })] },
  ];
  const p = plan([], [c({ id: 'r1', phone: '705 555 0001' })], { others });
  assert.equal(p.record.added, 1);
  assert.deepEqual(p.record.alsoIn, [{ line: 2, contactId: 'b1', listId: 'l2', listName: 'Beer league' }]);
});

test('script: replaced only when the sheet has one with items', () => {
  const l = { ...list(), script: [item] };
  const keep = planImport({ list: l, existing: [], others: [], parsed: parsed([], null), fileName: 'x.csv', by: 'K', now: NOW });
  assert.deepEqual(keep.list.script, [item]);
  assert.equal(keep.record.scriptReplaced, false);
  const empty = planImport({ list: l, existing: [], others: [], parsed: parsed([], []), fileName: 'x.xlsx', by: 'K', now: NOW });
  assert.deepEqual(empty.list.script, [item]);
  assert.equal(empty.record.scriptReplaced, false);
  const next: ScriptItem = { ...item, id: 's1', text: 'Hello' };
  const replaced = planImport({ list: l, existing: [], others: [], parsed: parsed([], [next]), fileName: 'x.xlsx', by: 'K', now: NOW });
  assert.deepEqual(replaced.list.script, [next]);
  assert.equal(replaced.record.scriptReplaced, true);
});

test('imports keep the newest MAX_IMPORT_RECORDS', () => {
  let l = list();
  for (let i = 0; i < MAX_IMPORT_RECORDS + 2; i++) {
    l = planImport({ list: l, existing: [], others: [], parsed: parsed([]), fileName: `f${i}.csv`, by: 'K', now: NOW }).list;
  }
  assert.equal(l.imports.length, MAX_IMPORT_RECORDS);
  assert.equal(l.imports[0].fileName, `f${MAX_IMPORT_RECORDS + 1}.csv`);
});

test('healCallList turns a legacy importReport into one ImportRecord', () => {
  const legacy = {
    id: 'l9', name: 'Old', sourceFileName: 'old.xlsx', script: [], createdBy: 'Keenan',
    createdAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z', deletedAt: null,
    importReport: { imported: 25, skipped: [{ line: 4, reason: 'no org', raw: 'x' }], warnings: [{ line: 5, reason: 'w' }] },
  } as unknown as CallList;
  const healed = healCallList(legacy);
  assert.equal(healed.imports.length, 1);
  assert.deepEqual(healed.imports[0], {
    at: '2026-09-07T00:00:00.000Z', by: 'Keenan', fileName: 'old.xlsx', added: 25, merged: [], alsoIn: [],
    skipped: [{ line: 4, reason: 'no org', raw: 'x' }], warnings: [{ line: 5, reason: 'w' }], scriptReplaced: true,
  });
  assert.equal('importReport' in healed, false);
  assert.equal('sourceFileName' in healed, false);
  assert.deepEqual(healCallList(blankCallList('n', 'New', 'K', NOW)).imports, []);
});
