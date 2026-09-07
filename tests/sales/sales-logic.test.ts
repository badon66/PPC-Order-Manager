import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CallLog, Contact } from '@/lib/types';
import {
  blankContact, blankCallLogInput, applyCallLog, applySkip, buildQueue, contactBucket, isClosed,
  nextCallDateFor, referralContactFrom, defaultNotNowMonth, validateCallLog, sessionTally, healContact,
} from '@/lib/data/sales-logic';

const NOW = '2026-09-06T20:00:00.000Z';
const TODAY = '2026-09-06';

function c(over: Partial<Contact> = {}): Contact {
  return { ...blankContact('l1', 1, NOW), id: over.id ?? 'c1', orgName: 'Org', phone: '7055550142', ...over };
}
function log(over: Partial<CallLog> = {}): CallLog {
  return {
    ...blankCallLogInput(NOW), id: 'g1', listId: 'l1', contactId: 'c1', outcome: 'no_answer',
    endedAt: NOW, createdAt: NOW, updatedAt: NOW, ...over,
  };
}

test('nextCallDateFor per outcome', () => {
  const k = c();
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'no_answer' }, k, TODAY), '2026-09-08');
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'voicemail' }, k, TODAY), '2026-09-10');
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'bad_number' }, k, TODAY), null);
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'bad_number', newPhone: '705 555 9999' }, k, TODAY), TODAY);
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'referred' }, k, TODAY), null);
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'callback', followUp: { date: '2026-09-09', time: '', note: '' } }, k, TODAY), '2026-09-09');
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'not_now', followUp: { date: '2027-06-01', time: '', note: '' } }, k, TODAY), '2027-06-01');
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'not_interested' }, k, TODAY), null);
  assert.equal(nextCallDateFor({ ...blankCallLogInput(NOW), outcome: 'do_not_call' }, k, TODAY), null);
});

test('applyCallLog: counts, rating, email, bad number, dnc, replacing', () => {
  const k = c({ altPhone: '', phone: '111', email: 'old@x.ca' });
  const p1 = applyCallLog(k, log({ outcome: 'voicemail', leadRating: 4 }), TODAY, { replacing: false });
  assert.equal(p1.callCount, 1);
  assert.equal(p1.lastCalledAt, NOW);
  assert.equal(p1.lastOutcome, 'voicemail');
  assert.equal(p1.leadRating, 4);
  assert.equal(p1.nextCallDate, '2026-09-10');

  const p2 = applyCallLog(k, log({ outcome: 'send_info', email: 'new@x.ca' }), TODAY, { replacing: false });
  assert.equal(p2.email, 'new@x.ca');

  const p3 = applyCallLog(k, log({ outcome: 'bad_number', newPhone: '222' }), TODAY, { replacing: false });
  assert.equal(p3.phone, '222');
  assert.equal(p3.altPhone, '111');

  const p4 = applyCallLog(k, log({ outcome: 'do_not_call' }), TODAY, { replacing: false });
  assert.equal(p4.doNotCall, true);

  const p5 = applyCallLog({ ...k, callCount: 3, lastCalledAt: '2026-09-01T00:00:00.000Z' }, log({ outcome: 'callback', followUp: { date: '2026-09-10', time: '', note: '' } }), TODAY, { replacing: true });
  assert.equal(p5.callCount, undefined);
  assert.equal(p5.lastCalledAt, undefined);
  assert.equal(p5.lastOutcome, 'callback');
  assert.equal(p5.leadRating, undefined);
});

test('applySkip', () => {
  const p = applySkip(c({ skipCount: 2 }), NOW);
  assert.equal(p.skipCount, 3);
  assert.equal(p.lastSkippedAt, NOW);
});

test('isClosed and contactBucket', () => {
  assert.ok(!isClosed(c()));
  assert.ok(isClosed(c({ callCount: 1, lastOutcome: 'not_interested' })));
  assert.ok(isClosed(c({ callCount: 1, lastOutcome: 'bad_number', nextCallDate: null })));
  assert.ok(!isClosed(c({ callCount: 1, lastOutcome: 'bad_number', nextCallDate: TODAY })));
  assert.equal(contactBucket(c({ doNotCall: true })), 'do_not_call');
  assert.equal(contactBucket(c()), 'uncalled');
  assert.equal(contactBucket(c({ callCount: 1, lastOutcome: 'voicemail' })), 'retry');
  assert.equal(contactBucket(c({ callCount: 1, lastOutcome: 'bad_number', nextCallDate: TODAY })), 'retry');
  assert.equal(contactBucket(c({ callCount: 1, lastOutcome: 'bad_number' })), 'done');
  assert.equal(contactBucket(c({ callCount: 1, lastOutcome: 'callback' })), 'follow_up');
  assert.equal(contactBucket(c({ callCount: 1, lastOutcome: 'referred' })), 'done');
});

test('buildQueue order: due → uncalled (priority, sheet, createdAt) → retry; skipped-today last; excludes', () => {
  const contacts: Contact[] = [
    c({ id: 'dnc', doNotCall: true }),
    c({ id: 'uB', priority: 'B', sortOrder: 1 }),
    c({ id: 'uA2', priority: 'A', sortOrder: 5 }),
    c({ id: 'uA1', priority: 'A', sortOrder: 2 }),
    c({ id: 'uA1ref', priority: 'A', sortOrder: 2, createdAt: '2026-09-06T21:00:00.000Z', source: 'referral' }),
    c({ id: 'uSkipped', priority: 'A', sortOrder: 0, lastSkippedAt: NOW }),
    c({ id: 'due1', callCount: 1, lastOutcome: 'callback', nextCallDate: '2026-09-05' }),
    c({ id: 'due2', callCount: 1, lastOutcome: 'no_answer', nextCallDate: TODAY }),
    c({ id: 'future', callCount: 1, lastOutcome: 'callback', nextCallDate: '2026-09-20' }),
    c({ id: 'retryOld', callCount: 1, lastOutcome: 'voicemail', nextCallDate: '2026-09-09', lastCalledAt: '2026-09-04T00:00:00.000Z' }),
    c({ id: 'retryNew', callCount: 1, lastOutcome: 'no_answer', nextCallDate: '2026-09-08', lastCalledAt: '2026-09-05T00:00:00.000Z' }),
    c({ id: 'closed', callCount: 1, lastOutcome: 'not_interested' }),
    c({ id: 'meeting', callCount: 1, lastOutcome: 'meeting_booked', nextCallDate: '2026-09-01' }),
  ];
  assert.deepEqual(buildQueue(contacts, TODAY), [
    'due1', 'due2',
    'uA1', 'uA1ref', 'uA2', 'uB', 'uSkipped',
    'retryOld', 'retryNew',
  ]);
});

test('referralContactFrom copies org fields, names the referral, sorts after source', () => {
  const src = c({ id: 'src', orgType: 'Adult Team', city: 'Kelowna', province: 'BC', priority: 'B', contactName: 'Pat' });
  const r = referralContactFrom(src, log({ outcome: 'referred', referral: { name: 'Sam Lee', role: 'Treasurer', phone: '250 555 0100', email: 's@x.ca' } }), '2026-09-06T21:00:00.000Z');
  assert.equal(r.source, 'referral');
  assert.equal(r.referredFromContactId, 'src');
  assert.equal(r.sortOrder, src.sortOrder);
  assert.equal(r.contactName, 'Sam Lee');
  assert.equal(r.role, 'Treasurer');
  assert.equal(r.phone, '250 555 0100');
  assert.equal(r.orgName, 'Org');
  assert.equal(r.city, 'Kelowna');
  assert.equal(r.priority, 'B');
  assert.equal(r.leadSource, 'Referral');
  assert.match(r.notes, /Referred by Pat/);
  assert.equal(r.callCount, 0);
});

test('defaultNotNowMonth: ordering month this year if ahead, else next year; unknown → next month', () => {
  assert.equal(defaultNotNowMonth(c({ orderingMonth: 'Nov' }), '2026-09-06'), '2026-11');
  assert.equal(defaultNotNowMonth(c({ orderingMonth: 'Sep' }), '2026-09-06'), '2027-09');
  assert.equal(defaultNotNowMonth(c({ orderingMonth: 'Jun' }), '2026-09-06'), '2027-06');
  assert.equal(defaultNotNowMonth(c({ orderingMonth: '' }), '2026-12-06'), '2027-01');
});

test('validateCallLog blocking and warnings', () => {
  const k = c();
  const base = blankCallLogInput(NOW);
  assert.deepEqual(validateCallLog({ ...base, outcome: 'no_answer' }, k, { replacing: false }).blocking, {});
  assert.ok(validateCallLog({ ...base, outcome: 'nonsense' as never }, k, { replacing: false }).blocking.outcome);
  assert.ok(validateCallLog({ ...base, outcome: 'no_answer', leadRating: 7 as never }, k, { replacing: false }).blocking.leadRating);
  assert.ok(validateCallLog({ ...base, outcome: 'callback' }, k, { replacing: false }).blocking['followUp.date']);
  assert.ok(validateCallLog({ ...base, outcome: 'callback', followUp: { date: '9/9/2026', time: '', note: '' } }, k, { replacing: false }).blocking['followUp.date']);
  assert.ok(validateCallLog({ ...base, outcome: 'callback', followUp: { date: '2026-09-09', time: '7pm', note: '' } }, k, { replacing: false }).blocking['followUp.time']);
  assert.ok(validateCallLog({ ...base, outcome: 'referred' }, k, { replacing: false }).blocking.referral);
  assert.deepEqual(validateCallLog({ ...base, outcome: 'referred', referral: { name: 'X', role: '', phone: '', email: '' } }, k, { replacing: false }).blocking, {});
  assert.ok(validateCallLog({ ...base, outcome: 'send_info', followUp: { date: '2026-09-13', time: '', note: '' } }, k, { replacing: false }).blocking.email);
  assert.ok(validateCallLog({ ...base, outcome: 'not_now' }, k, { replacing: false }).blocking['followUp.date']);
  assert.ok(validateCallLog({ ...base, outcome: 'no_answer', durationSeconds: -1 }, k, { replacing: false }).blocking.durationSeconds);
  assert.ok(validateCallLog({ ...base, outcome: 'no_answer' }, c({ doNotCall: true }), { replacing: false }).blocking.outcome);
  assert.deepEqual(validateCallLog({ ...base, outcome: 'do_not_call' }, c({ doNotCall: true }), { replacing: false }).blocking, {});
  assert.ok(validateCallLog({ ...base, outcome: 'callback', followUp: { date: '2026-09-09', time: '', note: '' } }, c({ callCount: 1, lastOutcome: 'do_not_call', doNotCall: true }), { replacing: true }).blocking.outcome);

  const w = validateCallLog({ ...base, outcome: 'interested', followUp: { date: '2026-09-13', time: '', note: '' }, email: 'not-an-email' }, k, { replacing: false });
  assert.deepEqual(w.blocking, {});
  assert.ok(w.warnings.email);
  const w2 = validateCallLog({ ...base, outcome: 'interested', followUp: { date: '2026-09-13', time: '', note: '' } }, k, { replacing: false });
  assert.ok(w2.warnings.email);
  const w3 = validateCallLog({ ...base, outcome: 'bad_number', newPhone: '123' }, k, { replacing: false });
  assert.ok(w3.warnings.newPhone);
});

test('sessionTally counts today by caller', () => {
  const logs: CallLog[] = [
    log({ id: '1', outcome: 'voicemail', callerName: 'Keenan', endedAt: '2026-09-06T15:00:00.000Z' }),
    log({ id: '2', outcome: 'callback', callerName: 'Keenan', endedAt: '2026-09-06T16:00:00.000Z' }),
    log({ id: '3', outcome: 'send_info', callerName: 'Keenan', endedAt: '2026-09-06T17:00:00.000Z' }),
    log({ id: '4', outcome: 'interested', callerName: 'Someone Else', endedAt: '2026-09-06T17:00:00.000Z' }),
    log({ id: '5', outcome: 'interested', callerName: 'Keenan', endedAt: '2026-09-05T17:00:00.000Z' }),
  ];
  assert.deepEqual(sessionTally(logs, 'Keenan', '2026-09-06'), { calls: 3, reached: 2, voicemails: 1, callbacks: 1, infoSent: 1 });
});

test('healContact backfills a row written before a field existed', () => {
  const partial = { id: 'x', listId: 'l', orgName: 'O' } as unknown as Contact;
  const h = healContact(partial);
  assert.equal(h.callCount, 0);
  assert.equal(h.skipCount, 0);
  assert.equal(h.priority, '');
  assert.deepEqual(h.raw, {});
  assert.equal(h.doNotCall, false);
  assert.equal(h.source, 'sheet');
});
