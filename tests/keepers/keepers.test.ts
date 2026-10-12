import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_KEEPERS_PER_SET, commonJerseySize, describeKeepers, keepersOfSet, pruneKeepers,
  randomFreeNumber, setKeeperCount, takenNumbers,
} from '@/lib/keepers';
import type { KeeperJersey } from '@/lib/types';

let seq = 0;
const ctx = (taken: string[] = [], size = 'L') => ({
  taken: new Set(taken),
  size,
  newId: () => `k${++seq}`,
  random: () => 0, // always the lowest free number, so the pick is checkable
});

function keeper(over: Partial<KeeperJersey>): KeeperJersey {
  return { id: 'x', setIndex: 0, number: '', name: '', size: '', ...over };
}

test('setKeeperCount: ticking the box adds one row with a free number and the common size', () => {
  const out = setKeeperCount([], 0, 1, ctx(['1', '2'], 'XL'));
  assert.equal(out.length, 1);
  assert.equal(out[0].setIndex, 0);
  assert.equal(out[0].number, '3');
  assert.equal(out[0].size, 'XL');
  assert.equal(out[0].name, '');
});

test('setKeeperCount: grows from the end and keeps what was typed', () => {
  const one = [keeper({ id: 'a', number: '88', size: 'M' })];
  const two = setKeeperCount(one, 0, 2, ctx(['88']));
  assert.equal(two.length, 2);
  assert.equal(two[0].id, 'a');
  assert.equal(two[0].number, '88');
  // the new row avoids the typed one even when it isn't in `taken` yet
  const fresh = setKeeperCount([keeper({ id: 'a', number: '1' })], 0, 2, ctx([]));
  assert.equal(fresh[1].number, '2');
});

test('setKeeperCount: shrinks from the end, to zero when unticked, never below', () => {
  const three = [keeper({ id: 'a' }), keeper({ id: 'b' }), keeper({ id: 'c' })];
  assert.deepEqual(setKeeperCount(three, 0, 1, ctx()).map((k) => k.id), ['a']);
  assert.deepEqual(setKeeperCount(three, 0, 0, ctx()), []);
  assert.deepEqual(setKeeperCount(three, 0, -4, ctx()), []);
});

test('setKeeperCount: only touches the set asked about, and caps the count', () => {
  const mixed = [keeper({ id: 'h', setIndex: 0 }), keeper({ id: 'a', setIndex: 1 })];
  const out = setKeeperCount(mixed, 1, 0, ctx());
  assert.deepEqual(out.map((k) => k.id), ['h']);
  const same = setKeeperCount(mixed, 0, 1, ctx());
  assert.equal(same, mixed, 'no change returns the same array');
  assert.equal(setKeeperCount([], 0, 99, ctx()).length, MAX_KEEPERS_PER_SET);
});

test('takenNumbers: roster, spares and keepers, sock-only rows hold nothing', () => {
  const taken = takenNumbers(
    [{ number: '7', sockOnly: false }, { number: ' 12 ', sockOnly: false }, { number: '99', sockOnly: true }, { number: '', sockOnly: false }],
    [{ number: '00', sockOnly: false }, { number: '55', sockOnly: true }],
    [{ number: '88' }],
  );
  assert.deepEqual([...taken].sort(), ['00', '12', '7', '88']);
});

test('randomFreeNumber: skips taken numbers, reads 07 as 7, empty when nothing is free', () => {
  assert.equal(randomFreeNumber(new Set(['1', '2']), () => 0), '3');
  assert.equal(randomFreeNumber(new Set(['01', '2']), () => 0), '3');
  assert.equal(randomFreeNumber(new Set(), () => 0.999999), '99');
  const all = new Set(Array.from({ length: 99 }, (_, i) => String(i + 1)));
  assert.equal(randomFreeNumber(all), '');
});

test('commonJerseySize: the size most of the team wears, first seen wins a tie', () => {
  assert.equal(commonJerseySize([
    { jerseySize: 'M', sockOnly: false }, { jerseySize: 'L', sockOnly: false },
    { jerseySize: 'L', sockOnly: false }, { jerseySize: 'XL', sockOnly: true },
  ]), 'L');
  assert.equal(commonJerseySize([{ jerseySize: 'S', sockOnly: false }, { jerseySize: 'M', sockOnly: false }]), 'S');
  assert.equal(commonJerseySize([{ jerseySize: '', sockOnly: false }]), '');
});

test('pruneKeepers: drops keepers of sets that no longer exist', () => {
  const ks = [keeper({ id: 'h', setIndex: 0 }), keeper({ id: 'a', setIndex: 1 })];
  assert.deepEqual(pruneKeepers(ks, 1).map((k) => k.id), ['h']);
  assert.equal(pruneKeepers(ks, 2), ks);
});

test('keepersOfSet / describeKeepers read back plainly', () => {
  const ks = [keeper({ setIndex: 0, number: '88', size: 'L' }), keeper({ setIndex: 1, number: '', name: 'SMITH', size: '' })];
  assert.equal(keepersOfSet(ks, 1).length, 1);
  assert.equal(describeKeepers(ks), '2 kept by Powerplay: #88 (L), no number yet SMITH (no size yet)');
  assert.equal(describeKeepers([]), '');
});
