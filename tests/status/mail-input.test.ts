import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mailInputFor } from '@/lib/customer-updates';
import { blankOrder } from '@/lib/order-utils';
import { DEFAULT_APP_SETTINGS } from '@/lib/types';
import type { ChangeLogEntry, OrderStatus } from '@/lib/types';

function moved(from: OrderStatus, to: OrderStatus, at: string): ChangeLogEntry {
  return { id: `${from}-${to}-${at}`, orderId: 'o1', action: 'status_changed', fromValue: from, toValue: to, summary: '', actorEmail: 'k', actorName: 'Keenan', at };
}

// mailInputFor imports `repo` at module scope, but only to pick a store object
// — no I/O happens until a repo method is actually called, and this function
// never calls one. So it's safe to import and test directly, no extraction needed.
test('mailInputFor: cameFromGate only from the latest change, paymentKind by status, stage URLs', () => {
  const o = { ...blankOrder(), status: 'in_production' as const };
  const base = 'https://example.com';
  const fromGate = [moved('waiting_for_production_deposit', 'in_production', '2026-09-20T10:00:00Z')];
  assert.equal(mailInputFor(o, fromGate, DEFAULT_APP_SETTINGS, base, {}).cameFromGate, true);
  const laterUnrelated = [...fromGate, moved('design_talk', 'in_production', '2026-09-21T10:00:00Z')];
  assert.equal(mailInputFor(o, laterUnrelated, DEFAULT_APP_SETTINGS, base, {}).cameFromGate, false);
  assert.equal(mailInputFor({ ...o, status: 'draft' }, [], DEFAULT_APP_SETTINGS, base, {}).paymentKind, 'initial_deposit');
  assert.equal(mailInputFor({ ...o, status: 'shipped' }, [], DEFAULT_APP_SETTINGS, base, {}).paymentKind, 'final_payment');
  const r = mailInputFor(o, [], DEFAULT_APP_SETTINGS, base, {});
  assert.equal(r.designUrl, `${base}/roster/${o.rosterToken}/design`);
  assert.equal(r.detailsUrl, `${base}/roster/${o.rosterToken}/details`);
});
