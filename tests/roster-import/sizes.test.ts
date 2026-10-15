import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deduceBare, hasBareLetters, normSize, parseSize, translateSize, valueKey } from '@/lib/roster-import/sizes';

const t = (field: 'jerseySize' | 'sockSize' | 'pantSize', raw: string, goalieRow = false, bare?: 'youth' | 'senior') =>
  translateSize(field, raw, { goalieRow, bare });
const value = (r: ReturnType<typeof t>) => ('value' in r ? r.value : r.kind);

test('parseSize: the ways a size gets written', () => {
  assert.deepEqual([parseSize('YM').group, parseSize('YM').letter], ['youth', 'M']);
  assert.deepEqual([parseSize('Adult Large').group, parseSize('Adult Large').letter], ['senior', 'L']);
  assert.deepEqual([parseSize('Y-L').group, parseSize('Y-L').letter], ['youth', 'L']);
  assert.deepEqual([parseSize("Men's XL").group, parseSize("Men's XL").letter], ['senior', 'XL']);
  assert.equal(parseSize('X-Large').letter, 'XL');
  assert.equal(parseSize('2X').letter, 'XXL');
  assert.equal(parseSize('Lrg').letter, 'L');
  assert.equal(parseSize('Sm/Md').letter, 'S/M');
  assert.equal(parseSize('Goalie L').goalie, true);
  assert.equal(parseSize('24 in').numeric, '24"');
  assert.equal(parseSize('52').numeric, '52');
  assert.equal(parseSize('TBD').special, 'blank');
  assert.equal(parseSize('Socks only').special, 'sockOnly');
  assert.equal(parseSize('GL').leftover, 'GL', 'an unknown abbreviation is never guessed');
  assert.notEqual(parseSize('Youth/Adult L').leftover, '', 'two age groups in one cell is a contradiction');
});

test('jerseys: marked sizes translate by table, exact ones pass through', () => {
  assert.equal(value(t('jerseySize', 'Senior Large')), 'Senior Large');
  assert.equal(t('jerseySize', 'Senior Large').kind, 'exact');
  assert.equal(value(t('jerseySize', 'Adult L')), 'Senior Large');
  assert.equal(value(t('jerseySize', 'YM')), 'Youth S/M');
  assert.equal(value(t('jerseySize', 'Youth XL')), 'Youth L/XL');
  assert.equal(value(t('jerseySize', 'AXXL')), 'Senior XXL');
  assert.equal(value(t('jerseySize', 'Goalie L')), 'Goalie L');
  assert.equal(value(t('jerseySize', 'Goalie 2XL')), 'Goalie 2XL');
  assert.equal(value(t('jerseySize', 'Youth Goalie')), 'Junior Goalie');
});

test('jerseys: a bare letter waits for the column decision, then follows it', () => {
  assert.equal(t('jerseySize', 'L').kind, 'needsBare');
  assert.equal(value(t('jerseySize', 'L', false, 'senior')), 'Senior Large');
  assert.equal(value(t('jerseySize', 'L', false, 'youth')), 'Youth L/XL');
  assert.equal(value(t('jerseySize', 'S', false, 'youth')), 'Youth S/M');
  // there's no senior XS and no youth XXL: those go to a person
  assert.equal(t('jerseySize', 'XS', false, 'senior').kind, 'decide');
  assert.equal(t('jerseySize', 'XXL', false, 'youth').kind, 'decide');
});

test('jerseys: a goalie is never given a cut by assumption', () => {
  const r = t('jerseySize', 'L', true);
  assert.equal(r.kind, 'decide');
  assert.equal(r.kind === 'decide' && r.suggestion, 'Goalie L');
  const player = t('jerseySize', 'Senior Large', true);
  assert.equal(player.kind, 'decide', 'a goalie row holding a player size is a question');
  assert.equal(value(t('jerseySize', 'Goalie XL', true)), 'Goalie XL');
});

test('jerseys: numbers, junior/intermediate and unknown words always go to a person', () => {
  for (const raw of ['52', '10-12', 'Junior L', 'Int M', 'Womens M', 'GL', 'big']) {
    assert.equal(t('jerseySize', raw, false, 'senior').kind, 'decide', raw);
  }
  assert.equal(t('jerseySize', 'Socks only').kind, 'sockOnly');
  assert.equal(t('jerseySize', 'TBD').kind, 'blank');
  assert.equal(t('jerseySize', '').kind, 'blank');
});

test('socks: letters map straight across; inches and age groups go to a person', () => {
  assert.equal(value(t('sockSize', 'L')), 'Large');
  assert.equal(value(t('sockSize', 'Medium')), 'Medium');
  assert.equal(value(t('sockSize', 'xl')), 'XL');
  assert.equal(value(t('sockSize', 'Adult L')), 'Large');
  assert.equal(t('sockSize', '24"').kind, 'decide');
  assert.equal(t('sockSize', 'Youth M').kind, 'decide');
  assert.equal(t('sockSize', 'Junior').kind, 'decide');
});

test('pants: senior letters, goalie pants, and the column decision for bare letters', () => {
  assert.equal(value(t('pantSize', 'Senior Medium')), 'Senior Medium');
  assert.equal(value(t('pantSize', 'Adult L')), 'Senior Large');
  assert.equal(t('pantSize', 'L').kind, 'needsBare');
  assert.equal(value(t('pantSize', 'L', false, 'senior')), 'Senior Large');
  assert.equal(t('pantSize', 'L', false, 'youth').kind, 'decide', 'no youth pant shells');
  assert.equal(value(t('pantSize', 'Goalie')), 'Senior Goalie');
  const g = t('pantSize', 'L', true);
  assert.equal(g.kind, 'decide');
  assert.equal(g.kind === 'decide' && g.suggestion, 'Senior Goalie');
  assert.equal(t('pantSize', '32').kind, 'decide', 'a waist size is someone else\'s chart');
});

test('deduceBare: youth markers in the column make the plain letters adult; nothing else is assumed', () => {
  assert.equal(deduceBare(['YM', 'L', 'M', 'YL']), 'senior');
  assert.equal(deduceBare(['L', 'M', 'S']), null);
  assert.equal(deduceBare(['Adult L', 'M']), null);
  assert.equal(hasBareLetters(['Adult L', 'YM']), false);
  assert.equal(hasBareLetters(['Adult L', 'M']), true);
});

test('valueKey: the same raw size decides the same way, goalie and player kept apart', () => {
  assert.equal(valueKey('jerseySize', false, ' l '), valueKey('jerseySize', false, 'L'));
  assert.notEqual(valueKey('jerseySize', true, 'L'), valueKey('jerseySize', false, 'L'));
  assert.equal(valueKey('sockSize', true, 'L'), valueKey('sockSize', false, 'L'));
  assert.equal(normSize('  x-large '), 'X LARGE');
});
