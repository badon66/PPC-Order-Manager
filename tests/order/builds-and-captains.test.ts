import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIER_DEFS, matchesTier, tierById, tierPatch } from '@/lib/constants';
import { blankOrder, buildsDiffer, captainCounts, customBrandingFiles, jerseyTypesInUse, setBuilds, setsForMode } from '@/lib/order-utils';
import { listPrice } from '@/lib/pricing';
import type { Order } from '@/lib/types';

/*
 * Keenan, 2026-10-20: Hybrid = Premier + stitched-on logos; home and away can
 * be different builds; home and away captain patches are separate designs;
 * several custom branding logos.
 */

function homeAway(over: Partial<Order> = {}): Order {
  const o = { ...blankOrder(), orderMode: 'home_away_set' as const, jerseyType: 'embroidered' as const, jerseyTier: 'pro' as const };
  o.sets = setsForMode('home_away_set', 2, []).map((s) => ({ ...s, playerJerseys: 15, goalieJerseys: 1 }));
  return { ...o, ...over };
}

test('Hybrid is Premier with the stitched-on logos turned on', () => {
  const hybrid = tierById('hybrid')!;
  const premier = tierById('premier')!;
  assert.deepEqual(hybrid.addons, premier.addons);
  const patch = tierPatch(hybrid);
  assert.equal(patch.stitchedSublimatedLogos, true);
  const built = { ...blankOrder(), jerseyType: 'sublimated' as const, ...patch };
  assert.ok(matchesTier(built, hybrid));
  // Premier leaves the logos alone, so a Premier build with them still reads as Premier.
  assert.ok(matchesTier(built, premier));
  assert.ok(TIER_DEFS.some((t) => t.id === 'hybrid' && t.jerseyTypes.includes('sublimated')));
});

test('one build unless a later set has its own', () => {
  const same = homeAway();
  assert.equal(buildsDiffer(same), false);
  assert.deepEqual(jerseyTypesInUse(same), ['embroidered']);

  const mixed = homeAway();
  mixed.sets = mixed.sets.map((s, i) => (i === 1 ? { ...s, jerseyType: 'sublimated' as const, jerseyTier: 'hybrid' as const } : s));
  assert.equal(buildsDiffer(mixed), true);
  assert.deepEqual(setBuilds(mixed).map((b) => [b.jerseyType, b.jerseyTier]), [['embroidered', 'pro'], ['sublimated', 'hybrid']]);
  assert.deepEqual(jerseyTypesInUse(mixed).sort(), ['embroidered', 'sublimated']);

  // Priced set by set, at each set's own tier.
  const lines = listPrice({ ...mixed, stitchedSublimatedLogos: true })!.lines;
  assert.ok(lines.some((l) => /Pro jerseys \(Home/.test(l.label) && l.qty === 16), JSON.stringify(lines));
  assert.ok(lines.some((l) => /Hybrid jerseys \(Away/.test(l.label) && l.qty === 16));
  // Stitched logos only on the sublimated set.
  assert.equal(lines.find((l) => /Stitched twill/.test(l.label))?.qty, 16);

  // Re-applying the mode keeps the away set's build.
  assert.equal(setsForMode('home_away_set', 2, mixed.sets)[1].jerseyType, 'sublimated');
});

test("home and away C's and A's are counted, and priced, separately", () => {
  const o = homeAway({ hasCaptainPatches: true, captainCQuantity: 1, captainAQuantity: 2, captainAwayCQuantity: 1, captainAwayAQuantity: 2 });
  assert.deepEqual(captainCounts(o), [{ label: 'Home', c: 1, a: 2 }, { label: 'Away', c: 1, a: 2 }]);
  const captains = listPrice(o)!.lines.find((l) => /C's and A's/.test(l.label));
  assert.equal(captains?.qty, 2, 'one set per design');
  const single = { ...blankOrder(), captainCQuantity: 1, captainAQuantity: 3, captainAwayCQuantity: 9 };
  assert.deepEqual(captainCounts(single), [{ label: '', c: 1, a: 3 }], 'away counts mean nothing without home/away');
});

test('each custom branding logo has its own files; old ungrouped files belong to the first', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  const assets = [
    { id: '1', role: 'custom_branding_logo' },
    { id: '2', role: 'custom_branding_placement', groupId: 'a' },
    { id: '3', role: 'custom_branding_logo', groupId: 'b' },
    { id: '4', role: 'main_crest', groupId: 'b' },
  ];
  assert.deepEqual(customBrandingFiles(items, assets, 'a').map((x) => x.id), ['1', '2']);
  assert.deepEqual(customBrandingFiles(items, assets, 'b').map((x) => x.id), ['3']);
});
