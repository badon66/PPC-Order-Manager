'use client';

import { PANT_SHELL_SIZES, SOCK_SIZES, jerseySizesFor } from '@/lib/constants';
import { MIXED, sharedValue, type BulkPatch } from '@/lib/roster-edit';
import type { RosterEntry } from '@/lib/types';

/**
 * The bulk-edit bar.
 *
 * Select some players and one more row appears, stuck to the bottom of the
 * screen, laid out like the rows above it. Whatever you change on it changes on
 * every selected player, immediately, the same way editing one row does. No
 * dialog, no Apply button — it IS a row, it just happens to be several.
 *
 * Each control shows the value the selected rows share, or reads "Mixed" when
 * they don't agree. Touching a control writes that one field and nothing else;
 * the rows' other fields are never sent. That's `applyBulkPatch`'s rule, and
 * it is what makes "set everyone's sock size" safe.
 *
 * It stays while the roster is on screen and goes when you scroll away from
 * it — the table owns that with an IntersectionObserver; this component just
 * draws.
 */

type Cut = 'skaters' | 'goalies' | 'mixed' | 'none';

export function RosterBulkBar({
  entries,
  selected,
  cut,
  homeAway,
  showSocks,
  showPantShells,
  onPatch,
  onClear,
}: {
  entries: RosterEntry[];
  selected: ReadonlySet<string>;
  cut: Cut;
  homeAway: boolean;
  showSocks: boolean;
  showPantShells: boolean;
  /** One field for every selected row. */
  onPatch: (patch: BulkPatch) => void;
  onClear: () => void;
}) {
  const n = selected.size;
  const v = <K extends keyof RosterEntry>(k: K) => sharedValue(entries, selected, k);
  const str = (k: 'playerNameAsPrinted' | 'number' | 'jerseySize' | 'sockSize' | 'pantShellSize' | 'notes') => {
    const x = v(k);
    return x === MIXED ? { value: '', mixed: true } : { value: (x as string) ?? '', mixed: false };
  };
  const tick = (k: 'homeJersey' | 'awayJersey' | 'homeSocks' | 'awaySocks') => {
    const x = v(k);
    return x === MIXED ? 'mixed' : x ? 'on' : 'off';
  };
  const qty = (k: 'jerseysPerPlayer' | 'socksPerPlayer') => {
    const x = v(k);
    return x === MIXED ? { value: '', mixed: true } : { value: String(x ?? 0), mixed: false };
  };
  const noNameState = (() => {
    const x = v('noName');
    return x === MIXED ? 'mixed' : x ? 'on' : 'off';
  })();

  const name = str('playerNameAsPrinted');
  const number = str('number');
  const jersey = str('jerseySize');
  const sock = str('sockSize');
  const pant = str('pantShellSize');
  const notes = str('notes');

  return (
    <div
      role="region"
      aria-label={`Editing ${n} selected players`}
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-ppc-gold bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.45)]"
    >
      <div className="mx-auto max-w-[110rem] px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-ppc-gold">
            {n} player{n === 1 ? '' : 's'} selected — anything you change here changes on all of them
          </span>
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted hover:text-foreground"
          >
            Done
          </button>
        </div>

        <div className="grid items-end gap-2 md:grid-cols-[minmax(10rem,1.4fr)_5rem_7rem_7rem_7rem_auto_minmax(8rem,1.2fr)]">
          <Cell label="Name on back">
            <input
              value={name.value}
              placeholder={name.mixed ? 'Mixed — type to set all' : 'Same name on all'}
              className={name.mixed ? 'placeholder:italic' : ''}
              onChange={(e) => onPatch({ playerNameAsPrinted: e.target.value })}
            />
            <div className="mt-1.5 flex gap-1.5">
              <Chip
                state={noNameState}
                label="No name"
                onClick={() => onPatch({ noName: noNameState !== 'on' })}
              />
            </div>
          </Cell>

          <Cell label="#">
            <input
              value={number.value}
              placeholder={number.mixed ? 'Mixed' : '—'}
              className={number.mixed ? 'placeholder:italic' : ''}
              onChange={(e) => onPatch({ number: e.target.value })}
            />
          </Cell>

          <Cell label={cut === 'goalies' ? 'Goalie jersey' : 'Jersey'}>
            {cut === 'mixed' ? (
              <span
                title="Skaters and goalies use different size lists. Select them separately to set jersey sizes."
                className="block rounded-lg border border-dashed border-amber-500/50 px-2 py-2 text-center text-xs text-amber-200"
              >
                Mixed cuts
              </span>
            ) : cut === 'none' ? (
              <span className="block py-2 text-center text-xs text-muted">—</span>
            ) : (
              <Select
                value={jersey.value}
                mixed={jersey.mixed}
                options={jerseySizesFor(cut === 'goalies')}
                onChange={(x) => onPatch({ jerseySize: x })}
              />
            )}
          </Cell>

          <Cell label="Sock" hidden={!showSocks}>
            <Select value={sock.value} mixed={sock.mixed} options={SOCK_SIZES} onChange={(x) => onPatch({ sockSize: x })} />
          </Cell>

          <Cell label="Pant" hidden={!showPantShells}>
            <Select value={pant.value} mixed={pant.mixed} options={PANT_SHELL_SIZES} onChange={(x) => onPatch({ pantShellSize: x })} />
          </Cell>

          {homeAway ? (
            <div className="flex items-end gap-2">
              <Cell label="Home J">
                <Tick state={tick('homeJersey')} onChange={(on) => onPatch({ homeJersey: on ? 1 : 0 })} />
              </Cell>
              <Cell label="Away J">
                <Tick state={tick('awayJersey')} onChange={(on) => onPatch({ awayJersey: on ? 1 : 0 })} />
              </Cell>
              <Cell label="Home S" hidden={!showSocks}>
                <Tick state={tick('homeSocks')} onChange={(on) => onPatch({ homeSocks: on ? 1 : 0 })} />
              </Cell>
              <Cell label="Away S" hidden={!showSocks}>
                <Tick state={tick('awaySocks')} onChange={(on) => onPatch({ awaySocks: on ? 1 : 0 })} />
              </Cell>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <Cell label="Jerseys">
                <Qty {...qty('jerseysPerPlayer')} onChange={(x) => onPatch({ jerseysPerPlayer: x })} />
              </Cell>
              <Cell label="Socks" hidden={!showSocks}>
                <Qty {...qty('socksPerPlayer')} onChange={(x) => onPatch({ socksPerPlayer: x })} />
              </Cell>
            </div>
          )}

          <Cell label="Notes">
            <input
              value={notes.value}
              placeholder={notes.mixed ? 'Mixed — type to set all' : 'Same note on all'}
              className={notes.mixed ? 'placeholder:italic' : ''}
              onChange={(e) => onPatch({ notes: e.target.value })}
            />
          </Cell>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Cell({ label, children, hidden = false }: { label: string; children: React.ReactNode; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[0.65rem] font-bold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

/** A select whose "Mixed" state is a real, visible option, not a lie about the first row. */
function Select({
  value,
  mixed,
  options,
  onChange,
}: {
  value: string;
  mixed: boolean;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={mixed ? '__mixed__' : value}
      onChange={(e) => e.target.value !== '__mixed__' && onChange(e.target.value)}
      className={mixed ? 'italic text-amber-200' : ''}
    >
      {mixed && <option value="__mixed__">Mixed</option>}
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Qty({ value, mixed, onChange }: { value: string; mixed: boolean; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      min={0}
      value={value}
      placeholder={mixed ? 'Mixed' : '0'}
      className={`w-20 ${mixed ? 'placeholder:italic' : ''}`}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  );
}

/** Three-state tick: on, off, or mixed (a dash in amber). Clicking mixed turns everyone on. */
function Tick({ state, onChange }: { state: 'on' | 'off' | 'mixed'; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'mixed' ? 'mixed' : state === 'on'}
      onClick={() => onChange(state !== 'on')}
      className={`flex h-9 w-16 items-center justify-center rounded-lg border text-sm font-bold transition-colors ${
        state === 'on'
          ? 'border-ppc-gold bg-ppc-gold/15 text-ppc-gold'
          : state === 'mixed'
            ? 'border-amber-500/60 bg-amber-500/10 text-amber-200'
            : 'border-line bg-surface-2 text-muted hover:border-ppc-gold/50'
      }`}
    >
      {state === 'on' ? '✓' : state === 'mixed' ? '±' : '—'}
    </button>
  );
}

function Chip({ state, label, onClick }: { state: 'on' | 'off' | 'mixed'; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1 text-[0.7rem] font-bold uppercase tracking-wide ${
        state === 'on'
          ? 'bg-ppc-gold text-black'
          : state === 'mixed'
            ? 'bg-amber-500/30 text-amber-100'
            : 'bg-surface-2 text-muted hover:text-foreground'
      }`}
    >
      {label}
      {state === 'mixed' ? ' ±' : ''}
    </button>
  );
}
