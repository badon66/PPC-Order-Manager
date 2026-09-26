import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSubmission, type SubmitLink, type SubmitPayload } from '@/lib/data/submission-logic';
import { diffSubmissions, healSubmission } from '@/lib/data/logic';
import type { ClientRosterSubmission } from '@/lib/types';

/**
 * "Your colours" travels with the design section — it's kept only when logos
 * or inspiration is asked for, and a stage submission's `sections` snapshot
 * is what tells `diffSubmissions` which parts of a previous submission are
 * even comparable. See submission-logic.ts and logic.ts.
 */

const designLink: SubmitLink = {
  sections: { logos: true, inspiration: true, roster: false, personalDetails: false },
  includesSocks: false,
  includesPantShells: false,
  extraJerseys: 0,
};

const detailsLink: SubmitLink = {
  sections: { logos: false, inspiration: false, roster: true, personalDetails: true },
  includesSocks: true,
  includesPantShells: false,
  extraJerseys: 0,
};

const payload = (over: Partial<SubmitPayload>): SubmitPayload => ({
  players: [], logos: [], inspiration: [], confirmed: true, ...over,
});

function ok(link: SubmitLink, p: SubmitPayload) {
  const r = cleanSubmission(link, p);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

test('cleanSubmission keeps a trimmed colours note when logos or inspiration is asked for', () => {
  const v = ok(designLink, payload({ colours: '  Navy and gold, like our old set  ' }));
  assert.equal(v.colours, 'Navy and gold, like our old set');

  const inspirationOnly: SubmitLink = { ...designLink, sections: { ...designLink.sections, logos: false } };
  const v2 = ok(inspirationOnly, payload({ colours: '  White with red trim  ' }));
  assert.equal(v2.colours, 'White with red trim');
});

test('cleanSubmission drops colours when neither logos nor inspiration is asked for', () => {
  const v = ok(detailsLink, payload({ colours: 'Navy and gold', rosterAnswer: 'later' }));
  assert.equal(v.colours, '');
});

test('cleanSubmission caps colours at 500 characters', () => {
  const v = ok(designLink, payload({ colours: 'x'.repeat(600) }));
  assert.equal(v.colours.length, 500);
});

const stored = (over: Partial<ClientRosterSubmission>): ClientRosterSubmission =>
  healSubmission({
    id: 's1', orderId: 'o1', revision: 1, changes: [],
    sections: designLink.sections, players: [], rosterFiles: [],
    extras: [], logos: [], inspiration: [], colours: '', confirmed: true,
    submittedAt: '2026-09-21T10:00:00.000Z', acceptedAt: null,
    ...over,
  });

test('diffSubmissions reports a Colours change line when colours change', () => {
  const prev = stored({ colours: 'Navy and gold' });
  const changes = diffSubmissions(prev, { ...stored({}), colours: 'Navy, gold and white' });
  assert.deepEqual(
    changes.filter((c) => c.label === 'Colours'),
    [{ section: 'inspiration', label: 'Colours', from: 'Navy and gold', to: 'Navy, gold and white' }],
  );
});

test('no Colours line when colours are unchanged', () => {
  const prev = stored({ colours: 'Navy and gold' });
  const changes = diffSubmissions(prev, { ...stored({}), colours: 'Navy and gold' });
  assert.deepEqual(changes.filter((c) => c.label === 'Colours'), []);
});

test('a details-page submission after a design-page one reports no logo, inspiration or colours lines', () => {
  const prev = stored({
    sections: designLink.sections,
    logos: [{ fileUrl: 'artwork/a.png', fileName: 'a.png', logoName: '', placementNotes: '', description: '' }],
    inspiration: [{ fileUrl: 'artwork/b.png', fileName: 'b.png', notes: '' }],
    colours: 'Navy and gold',
  });
  const next = stored({
    sections: detailsLink.sections,
    logos: [], inspiration: [], colours: '',
    contact: {
      firstName: 'Sam', lastName: 'Carter', email: 'sam@example.com', phone: '',
      street: '', secondary: '', city: '', province: '', postal: '',
    },
  });
  const changes = diffSubmissions(prev, next);
  assert.deepEqual(
    changes.filter((c) => c.section === 'logos' || c.section === 'inspiration'),
    [],
  );
  // The contact section IS asked for on this visit, so it's still compared.
  assert.ok(changes.some((c) => c.section === 'personalDetails'));
});

test('a design-page submission after a details-page one reports no roster or contact lines', () => {
  const prev = stored({
    sections: detailsLink.sections,
    players: [{
      playerNameAsPrinted: 'CARTER', number: '9', isGoalie: false, captaincy: '', sockOnly: false,
      jerseySize: 'L', sockSize: 'M', pantShellSize: '', notes: '',
    }],
    contact: {
      firstName: 'Sam', lastName: 'Carter', email: 'sam@example.com', phone: '',
      street: '', secondary: '', city: '', province: '', postal: '',
    },
  });
  const next = stored({ sections: designLink.sections, players: [], contact: undefined, colours: 'Navy and gold' });
  const changes = diffSubmissions(prev, next);
  assert.deepEqual(changes.filter((c) => c.section === 'roster' || c.section === 'personalDetails'), []);
  // Colours arrived for the first time on this visit — still worth a line.
  assert.ok(changes.some((c) => c.label === 'Colours'));
});
