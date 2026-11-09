import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanNoteInput, openNoteCounts, pageNotesOf, NOTE_MAX_TEXT } from '@/lib/page-notes';
import { pageNoteEntry, noteArchiveEntry } from '@/lib/data/logic';
import { sizeLabel } from '@/lib/constants';
import type { ChangeLogEntry } from '@/lib/types';

const actor = { email: 'k@x', name: 'Keenan' };
const later = (e: ChangeLogEntry, ms: number): ChangeLogEntry => ({ ...e, at: new Date(Date.parse(e.at) + ms).toISOString() });

test('cleanNoteInput: needs words, caps lengths, drops an unknown key shape', () => {
  assert.equal(cleanNoteInput({ text: '   ' }), null);
  const c = cleanNoteInput({ text: 'x'.repeat(NOTE_MAX_TEXT + 50), where: { key: 'roster:abc', label: ' Roster:  #12 Smith ', section: 'Player Roster', quote: 7 } })!;
  assert.equal(c.text.length, NOTE_MAX_TEXT);
  assert.deepEqual(c.where, { key: 'roster:abc', label: 'Roster: #12 Smith', section: 'Player Roster', quote: '' });
  assert.equal(cleanNoteInput({ text: 'hi', where: { key: '"><script>' } })!.where.key, '');
});

test('notes come back from history with archiving applied, and counted per order', () => {
  const a = pageNoteEntry({ id: 'o1' }, 'team', { where: { key: '', label: 'Main Crest', section: 'Artwork', quote: '' }, text: 'Bigger please' });
  const b = later(pageNoteEntry({ id: 'o1' }, 'factory', { where: { key: '', label: 'Font', section: 'Artwork', quote: '' }, text: 'Need the .otf' }), 5);
  const arch = later(noteArchiveEntry('o1', a.note!.id, true, actor), 10);
  const notes = pageNotesOf([arch, b, a]);
  assert.equal(notes.length, 2);
  assert.ok(notes.find((n) => n.from === 'team')!.archivedAt);
  assert.equal(notes.find((n) => n.from === 'factory')!.archivedAt, null);
  assert.deepEqual(openNoteCounts([a, b, arch]), { o1: 1 });
  const back = later(noteArchiveEntry('o1', a.note!.id, false, actor), 20);
  assert.deepEqual(openNoteCounts([a, b, arch, back]), { o1: 2 });
  assert.match(a.summary, /The team left a note on Main Crest/);
});

test('sizeLabel: senior sizes read plain, youth keeps its name', () => {
  assert.equal(sizeLabel('Senior XL'), 'XL');
  assert.equal(sizeLabel('Senior Goalie'), 'Goalie');
  assert.equal(sizeLabel('Youth S/M'), 'Youth S/M');
  assert.equal(sizeLabel('Goalie 2XL'), 'Goalie 2XL');
  assert.equal(sizeLabel(''), '');
});
