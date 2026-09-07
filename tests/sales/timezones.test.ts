import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneFor, localTimeFor } from '@/lib/sales/timezones';

test('province → zone, override wins, unknown → null', () => {
  assert.equal(zoneFor({ province: 'ON', timezoneOverride: '' }), 'America/Toronto');
  assert.equal(zoneFor({ province: 'SK', timezoneOverride: '' }), 'America/Regina');
  assert.equal(zoneFor({ province: 'BC', timezoneOverride: 'Mountain' }), 'America/Edmonton');
  assert.equal(zoneFor({ province: 'on', timezoneOverride: '' }), 'America/Toronto');
  assert.equal(zoneFor({ province: '', timezoneOverride: '' }), null);
  assert.equal(zoneFor({ province: 'XX', timezoneOverride: 'nonsense' }), null);
});

test('local time renders in the contact zone', () => {
  const noon = new Date('2026-09-06T16:00:00Z'); // 12:00 Toronto (EDT), 9:00 Vancouver (PDT)
  assert.equal(localTimeFor({ province: 'ON', timezoneOverride: '' }, noon), '12:00 pm');
  assert.equal(localTimeFor({ province: 'BC', timezoneOverride: '' }, noon), '9:00 am');
  assert.equal(localTimeFor({ province: 'NL', timezoneOverride: '' }, noon), '1:30 pm');
  assert.equal(localTimeFor({ province: '', timezoneOverride: '' }, noon), null);
});
