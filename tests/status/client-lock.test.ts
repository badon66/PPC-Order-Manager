import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIENT_LOCKED_MESSAGE, CLIENT_NOT_COLLECTING_MESSAGE, CLIENT_SHIPPED_MESSAGE, CLIENT_STALE_FORM_MESSAGE,
  assertSectionsOpen, clientFormReminder, contactComplete, contactOfOrder, isClientLockedError, openClientSections,
  pageAsks, publicViewOf, rosterLinkView, shippingDetailsMissing, submittableSections,
} from '@/lib/data/logic';
import { cleanSubmission } from '@/lib/data/submission-logic';
import { STAGE_SECTIONS } from '@/lib/data/stage-pages';
import { detailsStillOpenMessage } from '@/lib/data/timeline';
import { blankOrder } from '@/lib/order-utils';
import type { ClientLinkSections, Order, OrderStatus } from '@/lib/types';

/*
 * The customer's form locks by section, not all at once (Keenan, 2026-10-16):
 * the roster, logos and inspiration lock when production starts, because
 * they're what's being made; the contact and shipping details stay open until
 * the order ships, because production finishing before the address is in is
 * normal. And while anything is still open, the team page shows the form —
 * never "your jerseys are done, everything's locked in".
 */

const ALL: ClientLinkSections = { logos: true, inspiration: true, roster: true, personalDetails: true };
const ROSTER_AND_DETAILS: ClientLinkSections = { logos: false, inspiration: false, roster: true, personalDetails: true };
const NONE: ClientLinkSections = { logos: false, inspiration: false, roster: false, personalDetails: false };
const DETAILS_ONLY: ClientLinkSections = { ...NONE, personalDetails: true };

const BEFORE: OrderStatus[] = [
  'incomplete', 'draft', 'design_talk', 'finalizing_details', 'waiting_for_deposit', 'waiting_for_approval',
  'waiting_for_production_deposit',
];
const MAKING: OrderStatus[] = ['in_production', 'waiting_for_final_approval', 'waiting_for_payment'];
const GONE: OrderStatus[] = ['shipped', 'completed'];

function order(status: OrderStatus, over: Partial<Order> = {}): Order {
  return { ...blankOrder(), status, requestClientDetails: true, clientLinkSections: { ...ROSTER_AND_DETAILS }, ...over };
}

const address: Partial<Order> = {
  contactFirstName: 'Sam', contactLastName: 'Carter', contactPhone: '555-0100', contactEmail: 'sam@example.com',
  shippingStreet: '1 Rink Rd', shippingCity: 'Calgary', shippingProvince: 'AB', shippingPostal: 'T2P 1J9',
};

test('before production everything asked is open; while being made only the details; once shipped nothing', () => {
  for (const s of BEFORE) assert.deepEqual(openClientSections(ALL, s), ALL, s);
  for (const s of MAKING) assert.deepEqual(openClientSections(ALL, s), DETAILS_ONLY, s);
  for (const s of GONE) assert.deepEqual(openClientSections(ALL, s), NONE, s);
  // Only what was asked: details nobody ticked don't open by themselves.
  assert.deepEqual(openClientSections({ ...ALL, personalDetails: false }, 'waiting_for_payment'), NONE);
  // The design page's sections are all things being made; the details page keeps the address.
  assert.deepEqual(openClientSections(STAGE_SECTIONS.design, 'in_production'), NONE);
  assert.deepEqual(openClientSections(STAGE_SECTIONS.details, 'waiting_for_payment'), DETAILS_ONLY);
});

test('the team page after production: the form with the details only, and words that ask for them', () => {
  const v = rosterLinkView(order('waiting_for_payment'), 12);
  assert.equal(v.locked, true, 'the roster and artwork are locked');
  assert.deepEqual(v.open, DETAILS_ONLY, 'the address is still open');
  assert.deepEqual(rosterLinkView(order('design_talk'), 0).open, ROSTER_AND_DETAILS);
  assert.deepEqual(rosterLinkView(order('shipped'), 12).open, NONE);
  assert.deepEqual(rosterLinkView(order('waiting_for_payment', { requestClientDetails: false }), 12).open, NONE, 'link off');

  const ask = detailsStillOpenMessage('waiting_for_payment', false);
  assert.match(ask.text, /^Your jerseys are done\./);
  assert.match(ask.text, /we still need your contact and shipping details/);
  assert.doesNotMatch(`${ask.title} ${ask.text}`, /locked in|everything/i);
  const check = detailsStillOpenMessage('in_production', true);
  assert.equal(check.title, 'Check your shipping details');
  assert.match(check.text, /^Your order is being made\./);
});

test('submitting: details after production go through; a form opened before production is refused, not trimmed', () => {
  // The page after production shows the details only.
  assert.deepEqual(submittableSections(ROSTER_AND_DETAILS, 'waiting_for_payment', DETAILS_ONLY), { ok: true, sections: DETAILS_ONLY });
  // A tab opened before production still shows the roster: keeping the address
  // and dropping a size change would tell them both went through.
  assert.deepEqual(submittableSections(ROSTER_AND_DETAILS, 'in_production', ROSTER_AND_DETAILS), { ok: false, error: CLIENT_STALE_FORM_MESSAGE });
  // A form from before this rule sends no flags: it showed everything asked.
  assert.deepEqual(submittableSections(ROSTER_AND_DETAILS, 'in_production', undefined), { ok: false, error: CLIENT_STALE_FORM_MESSAGE });
  // Nothing open at all: the reason, worded for where the order is.
  assert.deepEqual(
    submittableSections({ ...ROSTER_AND_DETAILS, personalDetails: false }, 'in_production', undefined),
    { ok: false, error: CLIENT_LOCKED_MESSAGE },
  );
  assert.deepEqual(submittableSections(ROSTER_AND_DETAILS, 'shipped', DETAILS_ONLY), { ok: false, error: CLIENT_SHIPPED_MESSAGE });
  assert.deepEqual(submittableSections(NONE, 'design_talk', undefined), { ok: false, error: CLIENT_NOT_COLLECTING_MESSAGE });
  // Before production, as it always was: asked and shown; a section unticked since is dropped.
  assert.deepEqual(submittableSections(ROSTER_AND_DETAILS, 'design_talk', ALL), { ok: true, sections: ROSTER_AND_DETAILS });
  // Anything but `true` is not a flag.
  assert.deepEqual(
    submittableSections(ROSTER_AND_DETAILS, 'design_talk', { roster: 'yes', personalDetails: true }),
    { ok: true, sections: DETAILS_ONLY },
  );
});

test('a stage page asks for its own sections before production, and only what the link still asks for after', () => {
  const noDetails: ClientLinkSections = { ...ALL, personalDetails: false };
  assert.deepEqual(pageAsks(noDetails, 'design_talk', STAGE_SECTIONS.details), STAGE_SECTIONS.details, "before: the page's own set");
  assert.deepEqual(pageAsks(noDetails, 'waiting_for_payment', STAGE_SECTIONS.details), { ...NONE, roster: true });
  // Keenan unticked the details (he has the address): an old /details link asks for nothing.
  assert.deepEqual(openClientSections(pageAsks(noDetails, 'waiting_for_payment', STAGE_SECTIONS.details), 'waiting_for_payment'), NONE);
  assert.deepEqual(openClientSections(pageAsks(ROSTER_AND_DETAILS, 'waiting_for_payment', STAGE_SECTIONS.details), 'waiting_for_payment'), DETAILS_ONLY);
  assert.deepEqual(pageAsks(noDetails, 'waiting_for_payment'), noDetails, 'the hub: what Keenan ticked');
  // A /details tab from before production, sent after it, with the roster
  // unticked since: still refused — the roster on their screen is the tell.
  assert.deepEqual(
    submittableSections(pageAsks(DETAILS_ONLY, 'in_production', STAGE_SECTIONS.details), 'in_production', STAGE_SECTIONS.details),
    { ok: false, error: CLIENT_STALE_FORM_MESSAGE },
  );
});

test('complete means what the label needs: a name, a phone and the full street address', () => {
  const full = contactOfOrder({ ...blankOrder(), ...address });
  assert.equal(contactComplete(full), true);
  assert.equal(contactComplete(undefined), false);
  assert.equal(contactComplete({ ...full, firstName: '', lastName: '' }), false);
  assert.equal(contactComplete({ ...full, firstName: '' }), true, 'one name is enough');
  assert.equal(contactComplete({ ...full, postal: '' }), false);
  assert.equal(contactComplete({ ...full, email: '', secondary: '' }), true);
});

test('a details-only submission keeps the contact and drops a roster riding along', () => {
  const r = cleanSubmission(
    { sections: DETAILS_ONLY, includesSocks: true, includesPantShells: false, extraJerseys: 0 },
    {
      players: [{
        playerNameAsPrinted: 'SMITH', number: '9', isGoalie: false, captaincy: '', sockOnly: false,
        jerseySize: 'AL', sockSize: '', pantShellSize: '', notes: '',
      }],
      rosterAnswer: 'typed',
      logos: [{ fileUrl: 'artwork/x.png', fileName: 'x.png', logoName: '', placementNotes: '', description: '' }],
      inspiration: [],
      contact: {
        firstName: 'Sam', lastName: 'Carter', email: '', phone: '555-0100',
        street: '1 Rink Rd', secondary: '', city: 'Calgary', province: 'AB', postal: 'T2P 1J9',
      },
      confirmed: true,
    },
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.value.sections, DETAILS_ONLY);
  assert.equal(r.value.players.length, 0);
  assert.equal(r.value.logos.length, 0);
  assert.equal(r.value.contact?.street, '1 Rink Rd');
});

test('the write checks again: a roster after production is refused in words for the customer; details pass until shipped', () => {
  assert.doesNotThrow(() => assertSectionsOpen('waiting_for_payment', DETAILS_ONLY));
  assert.doesNotThrow(() => assertSectionsOpen('design_talk', ALL));
  const refused = (message: string) => (e: unknown) => isClientLockedError(e) && (e as Error).message === message;
  assert.throws(() => assertSectionsOpen('in_production', ROSTER_AND_DETAILS), refused(CLIENT_STALE_FORM_MESSAGE));
  assert.throws(() => assertSectionsOpen('in_production', { ...NONE, roster: true }), refused(CLIENT_LOCKED_MESSAGE));
  assert.throws(() => assertSectionsOpen('shipped', DETAILS_ONLY), refused(CLIENT_SHIPPED_MESSAGE));
});

test('the share sheet reminds after production only while the address is missing', () => {
  assert.equal(shippingDetailsMissing(order('waiting_for_payment')), true);
  assert.equal(shippingDetailsMissing(order('waiting_for_payment', address)), false);
  assert.equal(
    shippingDetailsMissing(order('waiting_for_payment', { ...address, shippingSecondary: '', contactEmail: '' })),
    false,
    'the unit line and the email are not what the box needs',
  );
  assert.equal(shippingDetailsMissing(order('waiting_for_payment', { ...address, contactPhone: ' ' })), true);

  const missing = publicViewOf(order('waiting_for_payment'), [], [], []);
  assert.equal(missing.clientFormOpen, true);
  assert.deepEqual(missing.clientFormSections, DETAILS_ONLY);
  assert.equal(publicViewOf(order('waiting_for_payment', address), [], [], []).clientFormOpen, false, 'no nagging for an address we have');
  assert.equal(publicViewOf(order('shipped'), [], [], []).clientFormOpen, false);
  assert.equal(publicViewOf(order('design_talk', address), [], [], []).clientFormOpen, true, 'before production, open is open');
  assert.equal(publicViewOf(order('design_talk', { requestClientDetails: false }), [], [], []).clientFormOpen, false);
  assert.deepEqual(clientFormReminder(order('design_talk')).sections, ROSTER_AND_DETAILS);
});
