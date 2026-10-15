import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORIGINAL_ROSTER_ID, activeRows, listRosters, planDeleteRoster, planNewRoster, planUseRoster, rosterFingerprint,
} from '@/lib/roster-versions';
import { blankOrder, blankRosterEntry } from '@/lib/order-utils';
import { planAcceptance } from '@/lib/data/logic';
import type { ClientRosterSubmission, Order, RosterEntry } from '@/lib/types';

function row(rosterId: string, name: string, sort = 0): RosterEntry {
  const r = blankRosterEntry('o1', sort);
  r.rosterId = rosterId;
  r.playerNameAsPrinted = name;
  return r;
}

const init = { source: 'import' as const, fileName: 'roster.pdf', submissionId: '', note: 'Read from roster.pdf' };

test('an order with one roster lists it as Roster 1 only when it has rows', () => {
  const o = blankOrder();
  assert.deepEqual(listRosters(o, []), []);
  const rows = [row('', 'SMITH')];
  const list = listRosters(o, rows);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, ORIGINAL_ROSTER_ID);
  assert.equal(list[0].label, 'Roster 1');
  assert.equal(list[0].inUse, true);
  assert.equal(list[0].rows, 1);
});

test('a new roster is numbered after the others, goes in use, and keeps the original listed', () => {
  const o = blankOrder();
  const rows = [row('', 'SMITH'), row('', 'CHEN')];
  const plan = planNewRoster(o, rows, init, { newId: 'r2', now: '2026-10-15T00:00:00Z' });
  assert.equal(plan.version.number, 2);
  assert.equal(plan.activeRosterId, 'r2');
  assert.deepEqual(plan.rosters.map((v) => v.id), [ORIGINAL_ROSTER_ID, 'r2']);

  // Before any rows existed, the first import is Roster 1.
  const fresh = planNewRoster(blankOrder(), [], init, { newId: 'rA', now: 'x' });
  assert.equal(fresh.version.number, 1);
  assert.deepEqual(fresh.rosters.map((v) => v.id), ['rA']);
});

test('numbers are never reused after a delete', () => {
  const o: Order = { ...blankOrder() };
  const rows = [row('', 'A')];
  const p2 = planNewRoster(o, rows, init, { newId: 'r2', now: 'x' });
  Object.assign(o, { rosters: p2.rosters, activeRosterId: p2.activeRosterId });
  const del = planDeleteRoster(o, [...rows, row('r2', 'B')], ORIGINAL_ROSTER_ID);
  assert.ok(del.ok);
  if (del.ok) o.rosters = del.rosters;
  const p3 = planNewRoster(o, [row('r2', 'B')], init, { newId: 'r3', now: 'x' });
  assert.equal(p3.version.number, 3);
});

test('the roster in use is what the sheets read; switching and deleting follow the rules', () => {
  const o: Order = { ...blankOrder() };
  const rows = [row('', 'OLD'), row('r2', 'NEW')];
  const p = planNewRoster(o, [rows[0]], init, { newId: 'r2', now: 'x' });
  Object.assign(o, { rosters: p.rosters, activeRosterId: p.activeRosterId });
  assert.deepEqual(activeRows(o, rows).map((r) => r.playerNameAsPrinted), ['NEW']);

  const cantDelete = planDeleteRoster(o, rows, 'r2');
  assert.equal(cantDelete.ok, false, 'the roster in use cannot be deleted');

  const use = planUseRoster(o, rows, ORIGINAL_ROSTER_ID);
  assert.ok(use.ok);
  if (use.ok) o.activeRosterId = use.activeRosterId;
  assert.deepEqual(activeRows(o, rows).map((r) => r.playerNameAsPrinted), ['OLD']);

  const del = planDeleteRoster(o, rows, 'r2');
  assert.ok(del.ok);
  if (del.ok) assert.deepEqual(del.deleteRowIds, [rows[1].id]);
  assert.equal(planUseRoster(o, rows, 'nope').ok, false);
});

test('accepting a team roster makes a new roster in use and removes nothing', () => {
  const o = blankOrder();
  o.sets = [{ ...o.sets[0], playerJerseys: 2 }];
  const existing = [row('', 'TYPED BY KEENAN')];
  const s = {
    id: 'sub1', orderId: o.id, revision: 2, changes: [], sections: { ...o.clientLinkSections, roster: true },
    players: [{ playerNameAsPrinted: 'SMITH', number: '9', isGoalie: false, captaincy: '', sockOnly: false, jerseySize: 'Senior Large', sockSize: '', pantShellSize: '', notes: '' }],
    rosterFiles: [], extras: [], logos: [], inspiration: [], colours: '', confirmed: true, submittedAt: 'x', acceptedAt: null,
    convertedFrom: { fileUrl: 'k', fileName: 'team.xlsx', notes: '' },
  } as unknown as ClientRosterSubmission;
  const plan = planAcceptance(s, o, existing, [], '2026-10-15T00:00:00Z');
  assert.ok(plan.newRoster);
  assert.equal(plan.newRoster!.number, 2);
  assert.equal(plan.newRoster!.fileName, 'team.xlsx');
  assert.equal(plan.orderPatch.activeRosterId, plan.newRoster!.id);
  assert.ok(plan.roster.every((r) => r.rosterId === plan.newRoster!.id));
  assert.equal('removeRosterIds' in plan, false);
});

test('the fingerprint changes when anything printed changes, and only then', () => {
  const a = [row('', 'SMITH', 0), row('', 'CHEN', 1)];
  a[0].number = '9';
  const before = rosterFingerprint(a, 'name_bars');
  assert.equal(rosterFingerprint(a.map((r) => ({ ...r, notes: 'x' })), 'name_bars'), before, 'notes are not printed');
  const changed = a.map((r, i) => (i === 1 ? { ...r, jerseySize: 'Senior Large' } : r));
  assert.notEqual(rosterFingerprint(changed, 'name_bars'), before);
  assert.notEqual(rosterFingerprint([a[0]], 'name_bars'), before);
  assert.match(before, /^[0-9a-f]{16}$/);
});

/* ------------------------------------------------------------------ *
 * The roster box at sign-off
 * ------------------------------------------------------------------ */

import { nextRosterNumber, rosterChangedSinceSignOff, rosterVerificationOf } from '@/lib/roster-versions';
import { ROSTER_VERIFICATION_STATEMENT } from '@/lib/constants';
import type { ApprovalRecord } from '@/lib/types';

function signedWith(o: Order, rows: RosterEntry[]): Order {
  const record: ApprovalRecord = {
    signedName: 'Pat', signatureDataUrl: '', signedAt: '2026-10-15T00:00:00Z', termsAccepted: true,
    termsUrl: '', statement: '', ipAddress: '', userAgent: '',
    roster: rosterVerificationOf(o, rows, listRosters(o, rows), ROSTER_VERIFICATION_STATEMENT),
  };
  return { ...o, approvalRecord: record };
}

test('sign-off records which roster was checked, how many, and what it printed', () => {
  const o = { ...blankOrder(), activeRosterId: 'r2', rosters: [{ id: 'r2', number: 2, source: 'import' as const, fileName: '', submissionId: '', createdAt: '', note: '' }] };
  const rows = [row('r2', 'SMITH'), row('r2', 'CHEN', 1)];
  const v = rosterVerificationOf(o, rows, o.rosters, ROSTER_VERIFICATION_STATEMENT);
  assert.equal(v.rosterId, 'r2');
  assert.equal(v.rosterNumber, 2);
  assert.equal(v.rows, 2);
  assert.equal(v.statement, ROSTER_VERIFICATION_STATEMENT);
  assert.equal(v.fingerprint, rosterFingerprint(rows, o.nameStyle));
});

test('a change to the roster after sign-off is caught; nothing changed reads as nothing changed', () => {
  const o = blankOrder();
  const rows = [row('', 'SMITH'), row('', 'CHEN', 1)];
  const signed = signedWith(o, rows);
  assert.equal(rosterChangedSinceSignOff(signed, rows)?.changed, false);

  const renamed = rows.map((r) => (r.playerNameAsPrinted === 'CHEN' ? { ...r, playerNameAsPrinted: 'CHENG' } : r));
  assert.equal(rosterChangedSinceSignOff(signed, renamed)?.changed, true);

  const resized = rows.map((r, i) => (i === 0 ? { ...r, jerseySize: 'Senior Large' } : r));
  assert.equal(rosterChangedSinceSignOff(signed, resized)?.changed, true);

  // Another roster put in use, even with the same rows, is a change.
  assert.equal(rosterChangedSinceSignOff({ ...signed, activeRosterId: 'r9' }, rows)?.changed, true);

  // No sign-off, or one from before the roster had its own box: nothing to compare.
  assert.equal(rosterChangedSinceSignOff(o, rows), null);
  assert.equal(rosterChangedSinceSignOff({ ...signed, approvalRecord: { ...signed.approvalRecord!, roster: undefined } }, rows), null);
});

test('the next roster number follows the highest, never reusing one', () => {
  assert.equal(nextRosterNumber([]), 1);
  assert.equal(nextRosterNumber([{ number: 1 }, { number: 3 }]), 4);
});

test("deleting the newest roster doesn't free its number", () => {
  const o: Order = { ...blankOrder() };
  const rows = [row('', 'A')];
  const p2 = planNewRoster(o, rows, init, { newId: 'r2', now: 'x' });
  Object.assign(o, { rosters: p2.rosters, activeRosterId: p2.activeRosterId, rosterNumbersUsed: p2.numbersUsed });
  assert.equal(o.rosterNumbersUsed, 2);
  // Back to Roster 1, then Roster 2 deleted.
  o.activeRosterId = ORIGINAL_ROSTER_ID;
  const del = planDeleteRoster(o, [...rows, row('r2', 'B')], 'r2');
  assert.ok(del.ok);
  if (del.ok) o.rosters = del.rosters;
  const next = planNewRoster(o, rows, init, { newId: 'r3', now: 'x' });
  assert.equal(next.version.number, 3, 'Roster 2 stays retired');
  assert.equal(nextRosterNumber(o.rosters.map((v) => ({ number: v.number })), o.rosterNumbersUsed), 3);
});
