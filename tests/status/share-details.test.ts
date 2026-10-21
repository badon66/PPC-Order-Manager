import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingContactOf, publicViewOf, shareDetailsOpen } from '@/lib/data/logic';
import { blankOrder } from '@/lib/order-utils';
import type { ClientRosterSubmission, SubmittedContact } from '@/lib/types';

/*
 * Keenan, 2026-10-20: when the order is missing the customer's details, the
 * order sheet itself lets them fill them in — until the order ships.
 */

const empty: SubmittedContact = { firstName: '', lastName: '', email: '', phone: '', street: '', secondary: '', city: '', province: '', postal: '' };
const full: SubmittedContact = { ...empty, firstName: 'Sam', phone: '555-0100', street: '1 Rink Rd', city: 'Calgary', province: 'AB', postal: 'T2P 1J9' };

function sub(over: Partial<ClientRosterSubmission>): ClientRosterSubmission {
  return {
    id: 'x', orderId: 'o', revision: 1, changes: [],
    sections: { logos: false, inspiration: false, roster: false, personalDetails: true },
    players: [], rosterFiles: [], extras: [], logos: [], inspiration: [], colours: '',
    contact: full, confirmed: true, submittedAt: '2026-10-20T10:00:00Z', acceptedAt: null,
    ...over,
  };
}

test('the form shows while details are missing or waiting, never once shipped', () => {
  assert.equal(shareDetailsOpen('design_talk', empty, null), true);
  assert.equal(shareDetailsOpen('waiting_for_payment', empty, null), true, 'after production too');
  assert.equal(shareDetailsOpen('waiting_for_payment', full, null), false, 'nothing missing: just the address to check');
  assert.equal(shareDetailsOpen('waiting_for_payment', full, full), true, 'sent and waiting: still fixable');
  assert.equal(shareDetailsOpen('shipped', empty, null), false);
});

test('what they sent shows until Keenan accepts it', () => {
  assert.deepEqual(pendingContactOf([sub({})]), full);
  assert.equal(pendingContactOf([sub({ acceptedAt: '2026-10-20T11:00:00Z' })]), null);
  // The newest submission with details decides; a roster-only one in between doesn't count.
  const older = sub({ contact: { ...full, street: 'old' }, submittedAt: '2026-10-19T10:00:00Z' });
  const rosterOnly = sub({ sections: { logos: false, inspiration: false, roster: true, personalDetails: false }, contact: undefined, submittedAt: '2026-10-21T10:00:00Z' });
  assert.equal(pendingContactOf([older, sub({}), rosterOnly])?.street, '1 Rink Rd');
  assert.equal(publicViewOf(blankOrder(), [], [], [], [sub({})]).pendingContact?.firstName, 'Sam');
  assert.equal(publicViewOf(blankOrder(), [], [], []).pendingContact, null);
});
