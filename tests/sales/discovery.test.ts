import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CallLog, Contact, Discovery } from '@/lib/types';
import {
  blankContact, blankCallLogInput, blankDiscovery, mergeDiscovery, applyCallLog, healCallLog, healContact, healCallList,
  blankCallList, validateCallLog,
} from '@/lib/data/sales-logic';

const NOW = '2026-09-09T20:00:00.000Z';
const c = (over: Partial<Contact> = {}): Contact => ({ ...blankContact('l1', 1, NOW), id: 'c1', orgName: 'Eagles', phone: '705', ...over });
const g = (over: Partial<CallLog> = {}): CallLog => ({ ...blankCallLogInput(NOW), id: 'g1', listId: 'l1', contactId: 'c1', endedAt: NOW, createdAt: NOW, updatedAt: NOW, ...over });
const d = (over: Partial<Discovery> = {}): Discovery => ({ ...blankDiscovery(), ...over });

test('mergeDiscovery: answered fields overwrite, unanswered keep what was known', () => {
  const base = d({ lastRedone: '3_5', satisfaction: 2, changeOneThing: 'thicker fabric', lookingAt: 'full_set', home: true, away: true, primaryPriority: 'price', alsoPriorities: ['durability'] });
  const same = mergeDiscovery(base, blankDiscovery());
  assert.deepEqual(same, base, 'a call with nothing asked changes nothing');
  const next = mergeDiscovery(base, d({ lastRedone: 'under_1', lookingAt: 'jersey_only', home: true, away: false, primaryPriority: 'turnaround', alsoPriorities: [] }));
  assert.equal(next.lastRedone, 'under_1');
  assert.equal(next.satisfaction, 2, 'kept');
  assert.equal(next.changeOneThing, 'thicker fabric', 'kept');
  assert.equal(next.lookingAt, 'jersey_only');
  assert.deepEqual([next.home, next.away], [true, false], 'home/away travel with Q4');
  assert.equal(next.primaryPriority, 'turnaround');
  assert.deepEqual(next.alsoPriorities, [], 'the also list is replaced with Q5, not unioned');
  assert.notEqual(next.alsoPriorities, base.alsoPriorities, 'no shared array');
});

test('applyCallLog writes the merged discovery onto the contact', () => {
  const contact = c({ discovery: d({ lastRedone: '2_3' }) });
  const patch = applyCallLog(contact, g({ outcome: 'interested', discovery: d({ satisfaction: 4, primaryPriority: 'design_help', alsoPriorities: ['price'] }) }), '2026-09-09', { replacing: false });
  assert.equal(patch.discovery?.lastRedone, '2_3');
  assert.equal(patch.discovery?.satisfaction, 4);
  assert.deepEqual(patch.discovery?.alsoPriorities, ['price']);
});

test('heal fills discovery on old rows and the new list fields', () => {
  const oldLog = g();
  delete (oldLog as Partial<CallLog>).discovery;
  assert.deepEqual(healCallLog(oldLog).discovery, blankDiscovery());
  const half = g({ discovery: { lastRedone: '1_2' } as Discovery });
  assert.deepEqual(healCallLog(half).discovery, { ...blankDiscovery(), lastRedone: '1_2' });
  const oldContact = c();
  delete (oldContact as Partial<Contact>).discovery;
  assert.deepEqual(healContact(oldContact).discovery, blankDiscovery());
  const oldList = blankCallList('l', 'L', 'K', NOW);
  delete (oldList as Partial<typeof oldList>).pickupLine;
  delete (oldList as Partial<typeof oldList>).quickFacts;
  delete (oldList as Partial<typeof oldList>).voicemailScript;
  const healed = healCallList(oldList);
  assert.equal(healed.pickupLine, '');
  assert.equal(healed.voicemailScript, '');
  assert.equal(healed.quickFacts, '');
});

test('validateCallLog blocks bad discovery values and accepts good ones', () => {
  const ok = validateCallLog({ ...blankCallLogInput(NOW), outcome: 'voicemail', discovery: d({ lastRedone: '5_plus', lookingAt: 'replacement', primaryPriority: 'price', alsoPriorities: ['turnaround'], satisfaction: 5 }) }, c(), { replacing: false });
  assert.deepEqual(ok.blocking, {});
  const bad = validateCallLog({ ...blankCallLogInput(NOW), outcome: 'voicemail', discovery: { ...d(), lastRedone: 'ages' as Discovery['lastRedone'] } }, c(), { replacing: false });
  assert.ok(bad.blocking.discovery);
  const badPrio = validateCallLog({ ...blankCallLogInput(NOW), outcome: 'voicemail', discovery: { ...d(), alsoPriorities: ['speed' as Discovery['alsoPriorities'][number]] } }, c(), { replacing: false });
  assert.ok(badPrio.blocking.discovery);
});
