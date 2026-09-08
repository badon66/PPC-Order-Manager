import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALL_OUTCOMES } from '@/lib/types';
import {
  CALL_OUTCOME_META, CALL_OUTCOME_OPTIONS, MISSED_OUTCOMES, TALKED_OUTCOMES, OUTCOME_HOTKEYS, SALES_PICKLISTS,
  PRIORITY_RANK, NOT_INTERESTED_REASONS,
} from '@/lib/constants';

test('every outcome has metadata and the option list is in declared order', () => {
  assert.deepEqual([...CALL_OUTCOME_OPTIONS], [...CALL_OUTCOMES]);
  for (const o of CALL_OUTCOMES) assert.ok(CALL_OUTCOME_META[o].label.length > 0);
});

test('groups split 4 / 7 and hotkeys cover all eleven', () => {
  assert.equal(MISSED_OUTCOMES.length, 4);
  assert.equal(TALKED_OUTCOMES.length, 7);
  assert.equal(OUTCOME_HOTKEYS.length, CALL_OUTCOME_OPTIONS.length);
});

test('pick-lists have the keys the sheet and the app rely on', () => {
  for (const k of ['orgType', 'role', 'province', 'timezoneOverride', 'ageDivisions', 'month', 'leadSource', 'priority', 'bestTimeToCall', 'yesNo', 'notInterestedReason']) {
    assert.ok(Array.isArray((SALES_PICKLISTS as Record<string, unknown>)[k]), k);
  }
  assert.equal(SALES_PICKLISTS.province.length, 13);
});

test('priority ranks A before B before C before blank; not-interested reasons come from the pick-list', () => {
  assert.ok(PRIORITY_RANK.A < PRIORITY_RANK.B && PRIORITY_RANK.B < PRIORITY_RANK.C && PRIORITY_RANK.C < PRIORITY_RANK['']);
  assert.deepEqual([...NOT_INTERESTED_REASONS], SALES_PICKLISTS.notInterestedReason);
  assert.ok(NOT_INTERESTED_REASONS.includes('Happy with supplier'));
});
