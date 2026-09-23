import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healOrder } from '@/lib/data/logic';
import { blankOrder } from '@/lib/order-utils';
import type { Order } from '@/lib/types';
import {
  allowedOrigins, dedupeKey, draftPatch, findDuplicate, isAllowedOrigin, parseIntake,
  RateLimiter, sectionsForRoute, splitName, tierFromStyle, variantOf,
} from '@/lib/data/intake-logic';

test('healOrder gives old rows a source and an empty enquiry', () => {
  const o = blankOrder() as Partial<Order>;
  delete o.source;
  delete o.enquiry;
  const healed = healOrder(o as Order);
  assert.equal(healed.source, 'manual');
  assert.equal(healed.enquiry, null);
});

test('blankOrder is a manual order with no enquiry', () => {
  const o = blankOrder();
  assert.equal(o.source, 'manual');
  assert.equal(o.enquiry, null);
});

const TOKEN = 'a'.repeat(64);
const good = {
  rosterToken: TOKEN, startingPoint: 'Starting from scratch', customerName: 'Sam Carter',
  email: 'sam@example.com', teamName: 'Ice Cats', quantity: '18 players + 2 goalies',
  jerseyStyle: 'Elite (Embroidery)', items: ['Jerseys', 'Socks'], colours: 'navy and gold',
};

test('parseIntake accepts a good body and trims it', () => {
  const r = parseIntake({ ...good, teamName: '  Ice Cats ', bogus: 'ignored' });
  assert.equal(r.ok, true);
  if (!r.ok || r.honeypot) throw new Error('expected a value');
  assert.equal(r.value.teamName, 'Ice Cats');
  assert.deepEqual(r.value.items, ['Jerseys', 'Socks']);
  assert.equal(r.value.previousOrder, '');
});

test('parseIntake refuses a missing email, a bad token and an unknown route', () => {
  assert.equal(parseIntake({ ...good, email: 'nope' }).ok, false);
  assert.equal(parseIntake({ ...good, rosterToken: 'short' }).ok, false);
  assert.equal(parseIntake({ ...good, startingPoint: 'Other' }).ok, false);
  assert.equal(parseIntake('text').ok, false);
});

test('parseIntake treats a filled honeypot as success with nothing to do', () => {
  const r = parseIntake({ ...good, website: 'http://spam' });
  assert.deepEqual(r, { ok: true, honeypot: true });
});

test('parseIntake caps fields at 2000 characters and drops unknown items', () => {
  const r = parseIntake({ ...good, extraDetails: 'x'.repeat(5000), items: ['Jerseys', 'Helmets'] });
  if (!r.ok || r.honeypot) throw new Error('expected a value');
  assert.equal(r.value.extraDetails.length, 2000);
  assert.deepEqual(r.value.items, ['Jerseys']);
});

test('tierFromStyle maps the five tiers and nothing else', () => {
  assert.deepEqual(tierFromStyle('Lite (Sublimated)'), { jerseyTier: 'lite', jerseyType: 'sublimated' });
  assert.deepEqual(tierFromStyle('Elite (Embroidery)'), { jerseyTier: 'elite', jerseyType: 'embroidered' });
  assert.deepEqual(tierFromStyle('Premier (Sublimated)'), { jerseyTier: 'premier', jerseyType: 'sublimated' });
  assert.deepEqual(tierFromStyle('Pro (Embroidery)'), { jerseyTier: 'pro', jerseyType: 'embroidered' });
  assert.deepEqual(tierFromStyle('Reversible (Sublimated)'), { jerseyTier: 'reversible', jerseyType: 'reversible_sublimated' });
  assert.equal(tierFromStyle('Not sure — help me pick'), null);
  assert.equal(tierFromStyle(''), null);
});

test('routes map to variants and section sets', () => {
  assert.equal(variantOf('Design ready'), 'ready');
  assert.equal(variantOf('Starting from scratch'), 'scratch');
  assert.equal(variantOf('Ordered before'), 'reorder');
  assert.equal(variantOf(null), null);
  assert.deepEqual(sectionsForRoute('Design ready'), { logos: true, inspiration: true, roster: true, personalDetails: false });
  assert.deepEqual(sectionsForRoute('Ordered before'), { logos: false, inspiration: false, roster: true, personalDetails: true });
});

test('splitName and dedupeKey', () => {
  assert.deepEqual(splitName('Sam Carter'), { first: 'Sam', last: 'Carter' });
  assert.deepEqual(splitName('Cher'), { first: 'Cher', last: '' });
  assert.deepEqual(splitName('Mary Anne  Smith'), { first: 'Mary', last: 'Anne  Smith' });
  assert.equal(dedupeKey(' Sam@Example.com ', 'ice  cats'), 'sam@example.com|ice cats');
});

test('draftPatch builds a website Draft with the link on', () => {
  const r = parseIntake(good);
  if (!r.ok || r.honeypot) throw new Error('expected a value');
  const p = draftPatch(r.value, '2026-09-20T18:00:00.000Z');
  assert.equal(p.status, 'draft');
  assert.equal(p.source, 'website');
  assert.equal(p.rosterToken, TOKEN);
  assert.equal(p.teamName, 'Ice Cats');
  assert.equal(p.contactFirstName, 'Sam');
  assert.equal(p.contactLastName, 'Carter');
  assert.equal(p.contactEmail, 'sam@example.com');
  assert.equal(p.jerseyTier, 'elite');
  assert.equal(p.jerseyType, 'embroidered');
  assert.equal(p.requestClientDetails, true);
  assert.deepEqual(p.clientLinkSections, { logos: true, inspiration: true, roster: true, personalDetails: false });
  assert.equal(p.enquiry?.startingPoint, 'Starting from scratch');
  assert.equal(p.enquiry?.receivedAt, '2026-09-20T18:00:00.000Z');
  assert.equal('specialNotes' in p, false);
});

test('findDuplicate matches a recent website Draft by email + team only', () => {
  const r = parseIntake(good);
  if (!r.ok || r.honeypot) throw new Error('expected a value');
  const now = Date.parse('2026-09-20T18:00:00.000Z');
  const base: Order = { ...blankOrder(), source: 'website', status: 'draft', teamName: 'Ice Cats', contactEmail: 'SAM@example.com', createdAt: new Date(now - 3600_000).toISOString() };
  assert.equal(findDuplicate([base], r.value, now)?.id, base.id);
  assert.equal(findDuplicate([{ ...base, createdAt: new Date(now - 25 * 3600_000).toISOString() }], r.value, now), null);
  assert.equal(findDuplicate([{ ...base, source: 'manual' }], r.value, now), null);
  assert.equal(findDuplicate([{ ...base, status: 'waiting_for_payment' }], r.value, now), null);
  assert.equal(findDuplicate([{ ...base, deletedAt: '2026-09-20T17:00:00.000Z' }], r.value, now), null);
});

test('origins and the rate limiter', () => {
  assert.deepEqual(allowedOrigins(undefined), ['https://www.powerplaycustoms.ca', 'https://powerplaycustoms.ca']);
  assert.deepEqual(allowedOrigins(' https://a.test , https://b.test/ '), ['https://a.test', 'https://b.test']);
  assert.equal(isAllowedOrigin('https://www.powerplaycustoms.ca', allowedOrigins(undefined)), true);
  assert.equal(isAllowedOrigin('https://evil.test', allowedOrigins(undefined)), false);
  assert.equal(isAllowedOrigin(null, allowedOrigins(undefined)), false);
  const rl = new RateLimiter(2, 1000);
  assert.equal(rl.allow('ip', 0), true);
  assert.equal(rl.allow('ip', 1), true);
  assert.equal(rl.allow('ip', 2), false);
  assert.equal(rl.allow('ip', 1001), true);
  assert.equal(rl.allow('other', 2), true);
});

test('source passes through, trimmed, and is empty when the page did not send it', () => {
  const withIt = parseIntake({ ...good, source: '  A friend or another team ' });
  assert.ok(withIt.ok && !withIt.honeypot);
  if (withIt.ok && !withIt.honeypot) assert.equal(withIt.value.source, 'A friend or another team');
  const without = parseIntake({ ...good });
  if (without.ok && !without.honeypot) assert.equal(without.value.source, '');
});
