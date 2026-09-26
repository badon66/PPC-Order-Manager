import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_SECTIONS, stagePagePaths } from '@/lib/data/stage-pages';

test('stage pages ask for exactly their own sections and live under the token', () => {
  assert.deepEqual(STAGE_SECTIONS.design, { logos: true, inspiration: true, roster: false, personalDetails: false });
  assert.deepEqual(STAGE_SECTIONS.details, { logos: false, inspiration: false, roster: true, personalDetails: true });
  assert.deepEqual(stagePagePaths('abc'), { design: '/roster/abc/design', details: '/roster/abc/details' });
});
