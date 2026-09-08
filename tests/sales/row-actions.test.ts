import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Contact } from '@/lib/types';
import { blankContact, blankCallLogInput, quickEditPatch, quickLogInput, validateCallLog, QUICK_EDIT_FIELDS } from '@/lib/data/sales-logic';

const NOW = '2026-09-08T20:00:00.000Z';
const c = (over: Partial<Contact> = {}): Contact => ({ ...blankContact('l1', 1, NOW), id: 'c1', orgName: 'Eagles', phone: '705 555 0142', ...over });

test('quickEditPatch keeps only the allowlisted fields, trimmed', () => {
  const r = quickEditPatch({
    contactName: '  Jamie ', role: 'Coach', phone: '705 555 0142 ', altPhone: '', email: 'J@x.ca', bestTimeToCall: 'Evenings',
    priority: 'b', notes: 'n', callCount: 99, isJerseyManager: true, raw: { x: 1 },
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(Object.keys(r.patch).sort(), [...QUICK_EDIT_FIELDS].sort());
  assert.equal(r.patch.contactName, 'Jamie');
  assert.equal(r.patch.phone, '705 555 0142');
  assert.equal(r.patch.priority, 'B');
  assert.equal('callCount' in r.patch, false);
});

test('quickEditPatch: missing fields become empty, bad priority is refused', () => {
  const r = quickEditPatch({});
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.patch.contactName, '');
  const bad = quickEditPatch({ priority: 'Z' });
  assert.ok(!bad.ok);
});

test('quickLogInput is a zero-duration call stamped with the caller, no session', () => {
  const q = quickLogInput(
    { ...blankCallLogInput('2026-01-01T00:00:00.000Z'), outcome: 'voicemail', notes: 'left msg', sessionId: 'stale', durationSeconds: 500 },
    'Keenan', NOW,
  );
  assert.equal(q.startedAt, NOW);
  assert.equal(q.endedAt, NOW);
  assert.equal(q.durationSeconds, 0);
  assert.equal(q.sessionId, null);
  assert.equal(q.callerName, 'Keenan');
  assert.equal(q.outcome, 'voicemail');
  assert.equal(q.notes, 'left msg');
  assert.deepEqual(validateCallLog(q, c(), { replacing: false }).blocking, {});
  const dnc = validateCallLog(q, c({ doNotCall: true }), { replacing: false });
  assert.ok(Object.keys(dnc.blocking).length > 0, 'a Do Not Call contact refuses other outcomes');
});
