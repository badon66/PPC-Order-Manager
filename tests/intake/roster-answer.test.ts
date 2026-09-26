import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSubmission, type SubmitLink, type SubmitPayload } from '@/lib/data/submission-logic';
import { diffSubmissions, healSubmission, planAcceptance, submissionLogEntries } from '@/lib/data/logic';
import { blankOrder } from '@/lib/order-utils';
import type { ClientRosterSubmission, SubmittedPlayer } from '@/lib/types';

const link: SubmitLink = {
  sections: { logos: true, inspiration: true, roster: true, personalDetails: false },
  includesSocks: true,
  includesPantShells: false,
  extraJerseys: 0,
};

const player: SubmittedPlayer = {
  playerNameAsPrinted: 'CARTER', number: '9', isGoalie: false, captaincy: 'C', sockOnly: false,
  jerseySize: 'L', sockSize: 'M', pantShellSize: '', notes: '',
};
const file = { fileUrl: 'artwork/abc.xlsx', fileName: 'ice-cats-roster.xlsx', notes: ' sizes on tab 2 ' };

const payload = (over: Partial<SubmitPayload>): SubmitPayload => ({
  players: [player], logos: [], inspiration: [], confirmed: true, ...over,
});

function ok(p: SubmitPayload) {
  const r = cleanSubmission(link, p);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

test('"typed" keeps the rows and drops any file', () => {
  const v = ok(payload({ rosterAnswer: 'typed', rosterFiles: [file] }));
  assert.equal(v.rosterAnswer, 'typed');
  assert.equal(v.players.length, 1);
  assert.deepEqual(v.rosterFiles, []);
});

test('"file" keeps the uploaded list, trimmed, and drops the rows', () => {
  const v = ok(payload({ rosterAnswer: 'file', rosterFiles: [file, { fileUrl: '', fileName: 'x', notes: '' }] }));
  assert.equal(v.rosterAnswer, 'file');
  assert.deepEqual(v.players, []);
  assert.deepEqual(v.rosterFiles, [{ fileUrl: 'artwork/abc.xlsx', fileName: 'ice-cats-roster.xlsx', notes: 'sizes on tab 2' }]);
});

test('"not yet" on its own is a valid submission and carries nothing else', () => {
  const v = ok(payload({ players: [], rosterAnswer: 'later', rosterFiles: [file] }));
  assert.equal(v.rosterAnswer, 'later');
  assert.deepEqual(v.players, []);
  assert.deepEqual(v.rosterFiles, []);
});

test('no answer at all keeps the rows, as before the question existed', () => {
  const v = ok(payload({}));
  assert.equal(v.rosterAnswer, undefined);
  assert.equal(v.players.length, 1);
});

test('an answer that is not one of the three is ignored, and nothing else means an error', () => {
  const r = cleanSubmission(link, payload({ players: [], rosterAnswer: 'maybe' as never }));
  assert.equal(r.ok, false);
});

test('with the roster section off, the answer and the file are dropped', () => {
  const off = { ...link, sections: { ...link.sections, roster: false } };
  const r = cleanSubmission(off, payload({ rosterAnswer: 'file', rosterFiles: [file], logos: [{ fileUrl: 'artwork/l.png', fileName: 'l.png', logoName: '', placementNotes: '', description: '' }] }));
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.rosterAnswer, undefined);
    assert.deepEqual(r.value.rosterFiles, []);
    assert.deepEqual(r.value.players, []);
  }
});

const stored = (over: Partial<ClientRosterSubmission>): ClientRosterSubmission =>
  healSubmission({
    id: 's1', orderId: 'o1', revision: 1, changes: [], sections: link.sections, players: [], rosterFiles: [],
    extras: [], logos: [], inspiration: [], colours: '', confirmed: true, submittedAt: '2026-09-21T10:00:00.000Z', acceptedAt: null,
    ...over,
  });

test('healSubmission gives an old row an empty roster file list', () => {
  const s = healSubmission({ players: [], logos: [] } as unknown as ClientRosterSubmission);
  assert.deepEqual(s.rosterFiles, []);
});

test('a revisit that turns "not yet" into a file shows up as two changes', () => {
  const prev = stored({ rosterAnswer: 'later' });
  const changes = diffSubmissions(prev, { ...stored({}), rosterAnswer: 'file', rosterFiles: [file] });
  assert.deepEqual(
    changes.map((c) => [c.label, c.from, c.to]),
    [['Roster files', '0', '1'], ['Roster', 'not ready yet', 'sent as a file']],
  );
});

test('the history line says a roster file arrived, or that the roster is not ready', () => {
  assert.match(submissionLogEntries(stored({ rosterAnswer: 'file', rosterFiles: [file] }), 'Ice Cats')[0].summary, /1 roster file/);
  assert.match(submissionLogEntries(stored({ rosterAnswer: 'later' }), 'Ice Cats')[0].summary, /roster not ready yet/);
});

test('accepting keeps a roster file on the submission and says so, adding nobody to the roster', () => {
  const plan = planAcceptance(stored({ rosterAnswer: 'file', rosterFiles: [file] }), blankOrder(), [], []);
  assert.deepEqual(plan.roster, []);
  assert.deepEqual(plan.assets, []);
  assert.match(plan.summary, /1 roster file\(s\) kept for typing up/);
});
