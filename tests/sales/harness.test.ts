import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '@/lib/dates';

test('tsx loader resolves the @/ alias and runs TypeScript', () => {
  assert.equal(addDays('2026-09-06', 1), '2026-09-07');
});
