import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_SECTIONS, sizesWanted, stagePageCopy, stagePagePaths } from '@/lib/data/stage-pages';

test('stage pages ask for exactly their own sections and live under the token', () => {
  assert.deepEqual(STAGE_SECTIONS.design, { logos: true, inspiration: true, roster: false, personalDetails: false });
  assert.deepEqual(STAGE_SECTIONS.details, { logos: false, inspiration: false, roster: true, personalDetails: true });
  assert.deepEqual(stagePagePaths('abc'), { design: '/roster/abc/design', details: '/roster/abc/details' });
});

test('the roster asks only for the sizes of what is on the order', () => {
  assert.equal(sizesWanted({ socks: false, pantShells: false }), 'jersey sizes');
  assert.equal(sizesWanted({ socks: true, pantShells: false }), 'jersey and sock sizes');
  assert.equal(sizesWanted({ socks: false, pantShells: true }), 'jersey and pant shell sizes');
  assert.equal(sizesWanted({ socks: true, pantShells: true }), 'jersey, sock and pant shell sizes');
  assert.match(stagePageCopy('details', { socks: false, pantShells: false }).intro, /their number, and jersey sizes, plus/);
  assert.doesNotMatch(stagePageCopy('details', { socks: false, pantShells: false }).intro, /sock/);
});
