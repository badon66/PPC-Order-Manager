import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCallListFile } from '@/lib/sales/import';
import { callListToCsv } from '@/lib/sales/export';
import { parseCsv } from '@/lib/csv';
import type { CallLog } from '@/lib/types';
import { blankCallLogInput } from '@/lib/data/sales-logic';

test('export round-trips headers, adds outcome columns and question columns', async () => {
  const r = await parseCallListFile({
    fileName: 'sample-list.xlsx', bytes: new Uint8Array(readFileSync('tests/sales/fixtures/sample-list.xlsx')),
    listId: 'l1', listName: 'S', createdBy: 'K', now: '2026-09-06T20:00:00.000Z',
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  const eagles = r.contacts[0];
  eagles.lastOutcome = 'send_info'; eagles.callCount = 1; eagles.leadRating = 4; eagles.nextCallDate = '2026-09-13'; eagles.email = 'new@example.ca';
  const log: CallLog = {
    ...blankCallLogInput('2026-09-06T20:00:00.000Z'), id: 'g1', listId: 'l1', contactId: eagles.id, outcome: 'send_info',
    notes: 'wants the catalogue', answers: { s7: 'Board vote' }, endedAt: '2026-09-06T20:05:00.000Z',
    createdAt: '2026-09-06T20:05:00.000Z', updatedAt: '2026-09-06T20:05:00.000Z',
  };
  const csv = callListToCsv({ list: r.list, contacts: r.contacts, logs: [log], sessions: [] });
  assert.ok(csv.startsWith('\uFEFF'));
  const rows = parseCsv(csv.slice(1));
  const header = rows[0];
  assert.equal(header[0], 'Org Name');
  assert.equal(header[25], 'Notes');
  assert.equal(header[26], 'Lead Rating');
  assert.equal(header[33], 'Source');
  assert.ok(header.includes('Q: Who looks after jerseys for [Org] — is that you, an equipment manager, or does the board decide?'));
  assert.equal(header[header.length - 1], 'Rink');
  const row = rows[1];
  assert.equal(row[0], 'Ennismore Eagles');
  assert.equal(row[6], 'new@example.ca');
  assert.equal(row[26], '4');
  assert.equal(row[27], 'Send Info');
  assert.equal(row[28], '1');
  assert.equal(row[31], '2026-09-13');
  assert.equal(row[32], 'wants the catalogue');
  assert.equal(row[header.indexOf('Q: Who looks after jerseys for [Org] — is that you, an equipment manager, or does the board decide?')], 'Board vote');
  assert.equal(row[header.length - 1], 'Ennismore CC');
  assert.equal(rows.length, 6);
});
