import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CallLog, CallSession, Contact } from '@/lib/types';
import {
  blankContact, blankCallLogInput, orgKey, linkedContacts, contactFromPerson, planJerseyManager,
  sessionTallyFor, sessionEnd, healContact, healCallLog, validateCallLog, blankCallSession,
} from '@/lib/data/sales-logic';

const NOW = '2026-09-07T20:00:00.000Z';
const c = (over: Partial<Contact> = {}): Contact => ({ ...blankContact('l1', 1, NOW), id: 'c1', orgName: 'Ennismore Eagles', contactName: 'Jamie', phone: '705', ...over });
const g = (over: Partial<CallLog> = {}): CallLog => ({ ...blankCallLogInput(NOW), id: 'g1', listId: 'l1', contactId: 'c1', endedAt: NOW, createdAt: NOW, updatedAt: NOW, ...over });
const blankPerson = { name: '', role: '', phone: '', email: '', note: '' };

test('orgKey and linkedContacts', () => {
  assert.equal(orgKey('  Ennismore   Eagles '), 'ennismore eagles');
  const all = [
    c(),
    c({ id: 'c2', orgName: 'ennismore eagles', contactName: 'Pat', sortOrder: 3 }),
    c({ id: 'c3', orgName: 'Kelowna' }),
    c({ id: 'c4', listId: 'l2' }),
    c({ id: 'c5', sortOrder: 2 }),
  ];
  assert.deepEqual(linkedContacts(all[0], all).map((x) => x.id), ['c5', 'c2']);
  assert.deepEqual(linkedContacts(c({ id: 'zz', orgName: '' }), all), []);
});

test('contactFromPerson copies the team, names the person, flags manager when asked', () => {
  const n = contactFromPerson(
    c({ city: 'Ennismore', priority: 'A' }),
    { name: 'Sam Lee', role: 'Treasurer', phone: '705 555 0100', email: 's@x.ca', note: 'evenings' },
    NOW,
    { isJerseyManager: true, reason: 'Named as jersey manager by Jamie' },
  );
  assert.equal(n.orgName, 'Ennismore Eagles');
  assert.equal(n.city, 'Ennismore');
  assert.equal(n.priority, 'A');
  assert.equal(n.contactName, 'Sam Lee');
  assert.equal(n.role, 'Treasurer');
  assert.equal(n.phone, '705 555 0100');
  assert.equal(n.isJerseyManager, true);
  assert.equal(n.source, 'referral');
  assert.equal(n.referredFromContactId, 'c1');
  assert.match(n.notes, /Named as jersey manager by Jamie/);
  assert.match(n.notes, /evenings/);
  assert.equal(n.sortOrder, 1);
  assert.equal(n.callCount, 0);
});

test('planJerseyManager: self, other-existing, other-new, other-empty, unanswered', () => {
  const me = c();
  const pat = c({ id: 'c2', contactName: 'Pat', isJerseyManager: true });
  const linked = [pat];

  const self = planJerseyManager(me, linked, g({ jerseyManager: { answer: 'self', existingContactId: '', person: blankPerson } }), NOW);
  assert.equal(self.currentPatch.isJerseyManager, true);
  assert.deepEqual(self.otherPatches, [{ id: 'c2', patch: { isJerseyManager: false } }]);
  assert.equal(self.newContact, null);

  const existing = planJerseyManager(
    c({ isJerseyManager: true }),
    [c({ id: 'c2', contactName: 'Pat' })],
    g({ jerseyManager: { answer: 'other', existingContactId: 'c2', person: blankPerson } }),
    NOW,
  );
  assert.equal(existing.currentPatch.isJerseyManager, false);
  assert.deepEqual(existing.otherPatches, [{ id: 'c2', patch: { isJerseyManager: true } }]);
  assert.equal(existing.newContact, null);

  const fresh = planJerseyManager(me, linked, g({ jerseyManager: { answer: 'other', existingContactId: '', person: { ...blankPerson, name: 'Sam' } } }), NOW);
  assert.equal(fresh.currentPatch.isJerseyManager, false);
  assert.deepEqual(fresh.otherPatches, [{ id: 'c2', patch: { isJerseyManager: false } }]);
  assert.equal(fresh.newContact?.contactName, 'Sam');
  assert.equal(fresh.newContact?.isJerseyManager, true);

  const empty = planJerseyManager(me, linked, g({ jerseyManager: { answer: 'other', existingContactId: '', person: blankPerson } }), NOW);
  assert.deepEqual(empty, { currentPatch: {}, otherPatches: [], newContact: null });

  const none = planJerseyManager(me, linked, g(), NOW);
  assert.deepEqual(none, { currentPatch: {}, otherPatches: [], newContact: null });
});

test('sessionTallyFor and sessionEnd', () => {
  const logs = [
    g({ id: '1', sessionId: 's1', outcome: 'voicemail', endedAt: '2026-09-07T20:10:00.000Z' }),
    g({ id: '2', sessionId: 's1', outcome: 'callback', endedAt: '2026-09-07T20:20:00.000Z' }),
    g({ id: '3', sessionId: 's2', outcome: 'send_info' }),
    g({ id: '4', sessionId: null, outcome: 'interested' }),
  ];
  assert.deepEqual(sessionTallyFor(logs, 's1'), { calls: 2, reached: 1, voicemails: 1, callbacks: 1, infoSent: 0 });
  assert.deepEqual(sessionTallyFor(logs, null), { calls: 0, reached: 0, voicemails: 0, callbacks: 0, infoSent: 0 });
  const open: CallSession = blankCallSession('s1', 'l1', 'Keenan', '2026-09-07T20:00:00.000Z');
  assert.equal(sessionEnd(open, logs), '2026-09-07T20:20:00.000Z');
  assert.equal(sessionEnd({ ...open, endedAt: '2026-09-07T21:00:00.000Z' }, logs), '2026-09-07T21:00:00.000Z');
  assert.equal(sessionEnd({ ...open, id: 's9' }, logs), '2026-09-07T20:00:00.000Z');
});

test('heal defaults and validation of foreign ids', () => {
  assert.equal(healContact({ id: 'x', listId: 'l', orgName: 'O' } as unknown as Contact).isJerseyManager, false);
  const h = healCallLog({ id: 'g', outcome: 'no_answer' } as unknown as CallLog);
  assert.equal(h.sessionId, null);
  assert.equal(h.jerseyManager.answer, '');
  const base = { ...blankCallLogInput(NOW), outcome: 'no_answer' as const };
  assert.ok(validateCallLog({ ...base, jerseyManager: { answer: 'other', existingContactId: 'nope', person: blankPerson } }, c(), { replacing: false, linkedIds: ['c2'] }).blocking.jerseyManager);
  assert.deepEqual(validateCallLog({ ...base, jerseyManager: { answer: 'other', existingContactId: 'c2', person: blankPerson } }, c(), { replacing: false, linkedIds: ['c2'] }).blocking, {});
  assert.ok(validateCallLog({ ...base, sessionId: 'zz' }, c(), { replacing: false, sessionIds: ['s1'] }).blocking.sessionId);
  assert.deepEqual(validateCallLog({ ...base, sessionId: 's1' }, c(), { replacing: false, sessionIds: ['s1'] }).blocking, {});
  assert.deepEqual(validateCallLog({ ...base, sessionId: null }, c(), { replacing: false, sessionIds: [] }).blocking, {});
});
