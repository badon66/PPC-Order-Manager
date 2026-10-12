import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankOrder, offersGoaliePantOption } from '@/lib/order-utils';

test('reversed goalie pant logos are offered only with a goalie AND pant shells', () => {
  const o = blankOrder();
  o.sets = [{ ...o.sets[0], goalieJerseys: 0, pantShells: 0 }];
  assert.equal(offersGoaliePantOption(o), false, 'nothing on the order');
  o.sets = [{ ...o.sets[0], goalieJerseys: 2, pantShells: 0 }];
  assert.equal(offersGoaliePantOption(o), false, 'goalie, no shells');
  o.sets = [{ ...o.sets[0], goalieJerseys: 0, pantShells: 18 }];
  assert.equal(offersGoaliePantOption(o), false, 'shells, no goalie');
  o.sets = [{ ...o.sets[0], goalieJerseys: 2, pantShells: 18 }];
  assert.equal(offersGoaliePantOption(o), true, 'goalie and shells');
  // a pant shell TYPE counts as shells on the order, same as the other includes-rules
  o.sets = [{ ...o.sets[0], goalieJerseys: 1, pantShells: 0 }];
  o.pantShellType = 'sublimated';
  assert.equal(offersGoaliePantOption(o), true, 'goalie and a shell type');
});
