import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_COPY } from '@/lib/route-copy';
import { rosterLinkView } from '@/lib/data/logic';
import { blankOrder } from '@/lib/order-utils';
import type { Order } from '@/lib/types';

test('every variant has a title, intro and the three hints', () => {
  for (const v of ['ready', 'scratch', 'reorder'] as const) {
    const c = ROUTE_COPY[v];
    assert.ok(c.title.length > 5 && c.intro.length > 20 && c.logosHint.length > 10 && c.inspirationHint.length > 10, v);
    assert.ok(c.rosterHint.length > 10, v + ' roster hint');
  }
  assert.equal(ROUTE_COPY.reorder.title, 'Same design, new season');
});

test('rosterLinkView carries the variant from the enquiry', () => {
  const manual = blankOrder();
  assert.equal(rosterLinkView(manual, 0).variant, null);
  const web: Order = {
    ...blankOrder(),
    enquiry: {
      startingPoint: 'Ordered before', league: '', quantity: '', timeline: '', jerseyStyle: '', items: [],
      artworkStatus: '', colours: '', inspiration: '', extraDetails: '', previousOrder: '',
      receivedAt: '2026-09-20T18:00:00.000Z',
    },
  };
  assert.equal(rosterLinkView(web, 0).variant, 'reorder');
});
