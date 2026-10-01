'use client';

import { useEffect, useState } from 'react';
import { PANT_SHELL_SIZES, SOCK_SIZES, jerseySizesFor } from '@/lib/constants';
import type { BulkPatch } from '@/lib/roster-edit';

/**
 * Edit many roster rows at once.
 *
 * "Everyone's a Large except the two goalies" was twenty separate dropdowns and
 * twenty chances to put the L on the wrong line.
 *
 * Every field opens on "Leave as is", and a field left there is NOT in the
 * patch — see `applyBulkPatch`. That one rule is what makes this a bulk edit
 * rather than a bulk overwrite: setting sock sizes can't blank jersey sizes,
 * because the jersey size was never sent.
 *
 * The dialog builds the patch and hands it back; it never touches the roster
 * itself. The rules about which rows may take which field live in
 * lib/roster-edit.ts, where they're tested.
 */

const KEEP = '__keep__';
const CLEAR = '__clear__';

type Cut = 'skaters' | 'goalies' | 'mixed' | 'none';

export function RosterBulkEdit({
  count,
  cut,
  homeAway,
  showSocks,
  showPantShells,
  onApply,
  onClose,
}: {
  count: number;
  /** Skaters, goalies, or a mix — decides which jersey size list is safe to offer. */
  cut: Cut;
  homeAway: boolean;
  showSocks: boolean;
  showPantShells: boolean;
  onApply: (patch: BulkPatch) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(KEEP);
  const [nameText, setNameText] = useState('');
  const [number, setNumber] = useState(KEEP);
  const [numberText, setNumberText] = useState('');
  const [noName, setNoName] = useState(KEEP);
  const [jersey, setJersey] = useState(KEEP);
  const [sock, setSock] = useState(KEEP);
  const [pant, setPant] = useState(KEEP);
  const [jerseyQty, setJerseyQty] = useState(KEEP);
  const [sockQty, setSockQty] = useState(KEEP);
  const [homeJersey, setHomeJersey] = useState(KEEP);
  const [awayJersey, setAwayJersey] = useState(KEEP);
  const [homeSocks, setHomeSocks] = useState(KEEP);
  const [awaySocks, setAwaySocks] = useState(KEEP);
  const [notes, setNotes] = useState(KEEP);
  const [notesText, setNotesText] = useState('');

  // Escape closes. Done here rather than on the backdrop so it works with the
  // focus inside a select.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mixedCuts = cut === 'mixed';

  function build(): BulkPatch {
    const p: BulkPatch = {};
    if (name === CLEAR) p.playerNameAsPrinted = '';
    else if (name === 'set') p.playerNameAsPrinted = nameText;
    if (number === CLEAR) p.number = '';
    else if (number === 'set') p.number = numberText;
    if (noName !== KEEP) p.noName = noName === '1';
    if (jersey !== KEEP) p.jerseySize = jersey === CLEAR ? '' : jersey;
    if (sock !== KEEP) p.sockSize = sock === CLEAR ? '' : sock;
    if (pant !== KEEP) p.pantShellSize = pant === CLEAR ? '' : pant;
    if (jerseyQty !== KEEP) p.jerseysPerPlayer = Number(jerseyQty);
    if (sockQty !== KEEP) p.socksPerPlayer = Number(sockQty);
    if (homeJersey !== KEEP) p.homeJersey = homeJersey === '1' ? 1 : 0;
    if (awayJersey !== KEEP) p.awayJersey = awayJersey === '1' ? 1 : 0;
    if (homeSocks !== KEEP) p.homeSocks = homeSocks === '1' ? 1 : 0;
    if (awaySocks !== KEEP) p.awaySocks = awaySocks === '1' ? 1 : 0;
    if (notes === CLEAR) p.notes = '';
    else if (notes === 'set') p.notes = notesText;
    return p;
  }

  const patch = build();
  const changes = Object.keys(patch).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${count} players`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">
              Edit {count} player{count === 1 ? '' : 's'}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Anything left on &ldquo;Leave as is&rdquo; isn&apos;t touched.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 py-1 text-muted hover:text-red-300"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 divide-y divide-line/60">
          <Row label="Name on back">
            <Choice
              value={name}
              onChange={setName}
              options={[
                [KEEP, 'Leave as is'],
                ['set', 'Set to…'],
                [CLEAR, 'Clear'],
              ]}
            />
            {name === 'set' && (
              <input
                autoFocus
                value={nameText}
                onChange={(e) => setNameText(e.target.value)}
                placeholder="Same name on every selected row"
                className="mt-1.5"
              />
            )}
          </Row>

          <Row label="No name on back">
            <Choice
              value={noName}
              onChange={setNoName}
              options={[
                [KEEP, 'Leave as is'],
                ['1', 'Yes — no name'],
                ['0', 'No — print the name'],
              ]}
            />
          </Row>

          <Row label="Number">
            <Choice
              value={number}
              onChange={setNumber}
              options={[
                [KEEP, 'Leave as is'],
                ['set', 'Set to…'],
                [CLEAR, 'Clear'],
              ]}
            />
            {number === 'set' && (
              <input
                value={numberText}
                onChange={(e) => setNumberText(e.target.value)}
                placeholder="Same number on every selected row"
                className="mt-1.5"
              />
            )}
          </Row>

          {mixedCuts ? (
            <div className="py-2.5">
              <p className="text-sm text-muted">
                <span className="font-semibold text-amber-200">Jersey size not offered:</span> this
                selection mixes skaters and goalies, which use different size lists. Select them
                separately to set jersey sizes.
              </p>
            </div>
          ) : (
            cut !== 'none' && (
              <Row label={cut === 'goalies' ? 'Goalie jersey size' : 'Jersey size'}>
                <SizeChoice value={jersey} options={jerseySizesFor(cut === 'goalies')} onChange={setJersey} />
              </Row>
            )
          )}

          {showSocks && (
            <Row label="Sock size">
              <SizeChoice value={sock} options={SOCK_SIZES} onChange={setSock} />
            </Row>
          )}
          {showPantShells && (
            <Row label="Pant shell size">
              <SizeChoice value={pant} options={PANT_SHELL_SIZES} onChange={setPant} />
            </Row>
          )}

          {homeAway ? (
            <>
              <Row label="Home jersey">
                <TickChoice value={homeJersey} onChange={setHomeJersey} />
              </Row>
              <Row label="Away jersey">
                <TickChoice value={awayJersey} onChange={setAwayJersey} />
              </Row>
              {showSocks && (
                <Row label="Home socks">
                  <TickChoice value={homeSocks} onChange={setHomeSocks} />
                </Row>
              )}
              {showSocks && (
                <Row label="Away socks">
                  <TickChoice value={awaySocks} onChange={setAwaySocks} />
                </Row>
              )}
            </>
          ) : (
            <>
              <Row label="Jerseys each">
                <QtyChoice value={jerseyQty} onChange={setJerseyQty} />
              </Row>
              {showSocks && (
                <Row label="Sock pairs each">
                  <QtyChoice value={sockQty} onChange={setSockQty} />
                </Row>
              )}
            </>
          )}

          <Row label="Notes">
            <Choice
              value={notes}
              onChange={setNotes}
              options={[
                [KEEP, 'Leave as is'],
                ['set', 'Set to…'],
                [CLEAR, 'Clear'],
              ]}
            />
            {notes === 'set' && (
              <input
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder="Same note on every selected row"
                className="mt-1.5"
              />
            )}
          </Row>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <span className="text-xs text-muted">
            {changes === 0 ? 'Nothing selected to change yet.' : `${changes} field${changes === 1 ? '' : 's'} will change.`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={changes === 0}
              onClick={() => onApply(patch)}
              className="rounded-lg bg-ppc-gold px-4 py-2 text-sm font-semibold text-black hover:bg-ppc-gold-dim disabled:opacity-40"
            >
              Apply to {count}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <span className="pt-2 text-sm text-muted">{label}</span>
      <div className="w-56 shrink-0">{children}</div>
    </div>
  );
}

function Choice({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<[value: string, label: string]>;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full">
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

function SizeChoice({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <Choice
      value={value}
      onChange={onChange}
      options={[[KEEP, 'Leave as is'], [CLEAR, 'Clear the size'], ...options.map((o): [string, string] => [o, o])]}
    />
  );
}

function TickChoice({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Choice
      value={value}
      onChange={onChange}
      options={[
        [KEEP, 'Leave as is'],
        ['1', 'Tick all'],
        ['0', 'Untick all'],
      ]}
    />
  );
}

function QtyChoice({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Choice
      value={value}
      onChange={onChange}
      options={[
        [KEEP, 'Leave as is'],
        ['0', '0'],
        ['1', '1'],
        ['2', '2'],
        ['3', '3'],
      ]}
    />
  );
}
