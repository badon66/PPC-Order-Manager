import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILD_ADDON_KEYS, TIER_DEFS, buildPartOf, matchesTier, tierById, tierPatch } from '@/lib/constants';
import { blankOrder, buildsDiffer, captainCounts, customBrandingFiles, jerseyTypesInUse, perSetShellTypes, perSetSockTypes, setAddons, setBuilds, setsForMode } from '@/lib/order-utils';
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

test('changing the Powerplay branding never changes which tier the build is', () => {
  for (const tier of TIER_DEFS) {
    const built = { ...blankOrder(), ...tierPatch(tier) };
    const noBranding = { ...built, rubberizedPpcCrest: false, printedSizingTag: false, ppcBackBranding: false };
    const allBranding = { ...built, rubberizedPpcCrest: true, printedSizingTag: true, ppcBackBranding: true };
    assert.ok(matchesTier(noBranding, tier), `${tier.id} without branding`);
    assert.ok(matchesTier(allBranding, tier), `${tier.id} with all branding`);
  }
  // A real build change still counts.
  const premier = { ...blankOrder(), ...tierPatch(tierById('premier')!), underarmVents: false };
  assert.equal(matchesTier(premier, tierById('premier')!), false);
});

test('socks and shells: each set its own type only when the builds differ and more than one set has them', () => {
  const o = homeAway({ sockType: 'embroidered', pantShellType: 'embroidered' });
  o.sets = o.sets.map((s, i) => ({ ...s, sockPairs: 16, ...(i === 1 ? { jerseyType: 'sublimated' as const, jerseyTier: 'hybrid' as const, sockType: 'sublimated' as const } : {}) }));
  assert.equal(perSetSockTypes(o), true);
  assert.deepEqual(setBuilds(o).map((b) => b.sockType), ['embroidered', 'sublimated']);
  const lines = listPrice(o)!.lines.filter((l) => /^Socks/.test(l.label));
  assert.deepEqual(lines.map((l) => [l.label, l.qty]), [['Socks (embroidered)', 16], ['Socks (sublimated)', 16]]);

  // Socks on one set only: one pair a player, one type — the order's.
  const one = { ...o, sets: o.sets.map((s, i) => (i === 0 ? { ...s, sockPairs: 0 } : s)) };
  assert.equal(perSetSockTypes(one), false);
  assert.deepEqual(setBuilds(one).map((b) => b.sockType), ['embroidered', 'embroidered']);
  // Same builds: never per set, whatever a set still carries.
  assert.equal(perSetSockTypes({ ...o, sets: o.sets.map((s) => ({ ...s, jerseyType: undefined })) }), false);
  assert.equal(perSetShellTypes(o), false, 'no shells on the order');
});

test('sets built differently each carry their own build add-ons', () => {
  const o = homeAway({ underarmVents: true, reinforcedElbows: true, twillBorderNumbers: true, ppcBackBranding: true });
  o.sets = o.sets.map((s, i) => ({ ...s, ...(i === 1 ? { jerseyType: 'sublimated' as const, jerseyTier: 'hybrid' as const, addons: { underarmVents: false, stitchedSublimatedLogos: true } } : {}) }));
  assert.equal(setAddons(o, 0).underarmVents, true);
  assert.equal(setAddons(o, 1).underarmVents, false, 'its own');
  assert.equal(setAddons(o, 1).reinforcedElbows, true, 'what it never set falls back to the order');
  // Stitched-on logos priced on the set that has them only.
  assert.equal(listPrice(o)!.lines.find((l) => /Stitched twill/.test(l.label))?.qty, 16);
  // Same builds again: a leftover add-on map means nothing.
  const same = { ...o, sets: o.sets.map((s) => ({ ...s, jerseyType: undefined })) };
  assert.equal(setAddons(same, 1).underarmVents, true);
  // A tier's preset, set by set, never carries the branding.
  const part = buildPartOf(tierPatch(tierById('premier')!));
  assert.ok(!('ppcBackBranding' in part) && part.underarmVents === true);
  assert.ok(BUILD_ADDON_KEYS.every((k) => !['ppcBackBranding', 'printedSizingTag', 'rubberizedPpcCrest'].includes(k)));
});
