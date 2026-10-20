import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSheetOf, cleanSectionComments, factoryViewOf, healOrder, publicViewOf, sheetComments } from '@/lib/data/logic';
import { blankOrder } from '@/lib/order-utils';
import type { Order } from '@/lib/types';

/*
 * Section comments carry who may read them. The customer's sheet shows only
 * "everyone"; the factory's adds "factory only"; "just me" is on no sheet.
 */

function order(over: Partial<Order> = {}): Order {
  return { ...blankOrder(), ...over };
}

const comments: Order['sectionComments'] = {
  addons: { text: 'Laces in gold', audience: 'everyone' },
  branding: { text: 'Sponsor above the back label', audience: 'factory' },
  artwork: { text: 'Crest still waiting on the vector', audience: 'internal' },
  roster: { text: '   ', audience: 'everyone' },
};

test('each sheet gets only what its reader may see, in form order, blanks skipped', () => {
  const o = order({ sectionComments: comments });
  assert.deepEqual(publicViewOf(o, [], [], []).sectionComments, [{ section: 'addons', text: 'Laces in gold' }]);
  assert.deepEqual(factoryViewOf(o, [], []).sectionComments, [
    { section: 'addons', text: 'Laces in gold' },
    { section: 'branding', text: 'Sponsor above the back label' },
  ]);
  assert.deepEqual(buildSheetOf(o, []).sectionComments, [], 'the shared sheet carries none on its own');
  assert.equal(sheetComments(o, ['internal'])[0].text, 'Crest still waiting on the vector');
  const json = JSON.stringify([publicViewOf(o, [], [], []), factoryViewOf(o, [], [])]);
  assert.ok(!json.includes('vector'), '"just me" reaches no sheet');
});

test('saving keeps known sections only, and an unknown audience becomes "just me"', () => {
  const clean = cleanSectionComments({
    addons: { text: 'ok', audience: 'everyone' },
    branding: { text: 'who knows', audience: 'public' },
    nonsense: { text: 'x', audience: 'everyone' },
    roster: 'not an object',
  });
  assert.deepEqual(clean, {
    addons: { text: 'ok', audience: 'everyone' },
    branding: { text: 'who knows', audience: 'internal' },
  });
  assert.deepEqual(cleanSectionComments(null), {});
});

test('custom branding travels to both sheets; old orders heal without it', () => {
  const o = order({ customBranding: true, customBrandingNotes: 'Smith Plumbing, above the back label' });
  assert.equal(publicViewOf(o, [], [], []).customBranding, true);
  assert.equal(factoryViewOf(o, [], []).customBrandingNotes, 'Smith Plumbing, above the back label');
  assert.equal(publicViewOf(order({ customBranding: false, customBrandingNotes: 'old' }), [], [], []).customBrandingNotes, '');
  const old = order();
  delete (old as Partial<Order>).customBranding;
  delete (old as Partial<Order>).sectionComments;
  const healed = healOrder(old);
  assert.equal(healed.customBranding, false);
  assert.deepEqual(healed.sectionComments, {});
});
