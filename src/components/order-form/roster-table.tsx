'use client';

import { useRef, useState } from 'react';
import { JERSEY_SIZES, PANT_SHELL_SIZES, SOCK_SIZES } from '@/lib/constants';
import { blankRosterEntry, stripSpaces } from '@/lib/order-utils';
import type { OrderMode, RosterEntry, SetQuantities } from '@/lib/types';
import { SizeSelect } from './fields';
import { RosterTally, buildTallies } from './roster-tally';

/**
 * Roster editor.
 *
 * Differences from the old Base44 table, all deliberate:
 *  - Sizes come from a controlled list (free text produced "Goalie XL" and
 *    "Sock Only" sitting in the jersey-size column of real orders).
 *  - Goalie is a toggle on the row. The old admin table had no goalie control
 *    at all — only the customer-facing form did.
 *  - Sock-only is its own flag rather than a string typed into a size field.
 *  - CSV import previews and reports unparseable rows instead of dropping them.
 *
 * Carried over from Base44, because it was right: in home/away mode the columns
 * become four tick boxes (home jersey, away jersey, home socks, away socks)
 * instead of quantity fields, with a live count against the set quantities. You
 * tick what each player gets, and a miscount shows up immediately.
 */

export function RosterTable({
  orderId,
  entries,
  orderMode,
  sets,
  onChange,
}: {
  orderId: string;
  entries: RosterEntry[];
  orderMode: OrderMode;
  sets: SetQuantities[];
  onChange: (next: RosterEntry[]) => void;
}) {
  const homeAway = orderMode === 'home_away_set';
  const [noSpaces, setNoSpaces] = useState(false);
  const [importReport, setImportReport] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function patch(i: number, p: Partial<RosterEntry>) {
    onChange(entries.map((e, idx) => (idx === i ? { ...e, ...p } : e)));
  }

  function addPlayer() {
    onChange([...entries, blankRosterEntry(orderId, entries.length)]);
  }

  function removePlayer(i: number) {
    onChange(entries.filter((_, idx) => idx !== i).map((e, idx) => ({ ...e, sortOrder: idx })));
  }

  async function handleCsv(file: File) {
    const text = await file.text();
    const { csvToRoster } = await import('@/lib/csv');
    const { entries: parsed, problems } = csvToRoster(text, orderId);

    if (parsed.length === 0 && problems.length > 0) {
      setImportReport(`Couldn't import: ${problems[0].reason} (line ${problems[0].line}).`);
      return;
    }

    onChange([
      ...entries,
      ...parsed.map((e, i) => ({ ...e, sortOrder: entries.length + i })),
    ]);

    setImportReport(
      problems.length === 0
        ? `Imported ${parsed.length} player${parsed.length === 1 ? '' : 's'}.`
        : `Imported ${parsed.length}. Skipped ${problems.length} row${
            problems.length === 1 ? '' : 's'
          }: ${problems.slice(0, 3).map((p) => `line ${p.line} (${p.reason})`).join(', ')}${
            problems.length > 3 ? '…' : ''
          }`,
    );
  }

  const goalies = entries.filter((e) => e.isGoalie && !e.sockOnly).length;
  const skaters = entries.filter((e) => !e.isGoalie && !e.sockOnly).length;
  const sockOnly = entries.filter((e) => e.sockOnly).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm text-muted">
          {skaters} skater{skaters === 1 ? '' : 's'} · {goalies} goalie{goalies === 1 ? '' : 's'}
          {sockOnly > 0 && ` · ${sockOnly} sock only`}
        </span>

        <button
          type="button"
          onClick={() => {
            const next = !noSpaces;
            setNoSpaces(next);
            if (next) {
              onChange(
                entries.map((e) => ({ ...e, playerNameAsPrinted: stripSpaces(e.playerNameAsPrinted) })),
              );
            }
          }}
          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
            noSpaces ? 'border-ppc-gold bg-ppc-gold/10 text-ppc-gold' : 'border-line bg-surface-2'
          }`}
        >
          No Spaces
        </button>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleCsv(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-semibold hover:border-ppc-gold/60"
        >
          Import CSV
        </button>
        <button
          type="button"
          onClick={addPlayer}
          className="rounded-lg bg-ppc-gold px-3 py-2 text-sm font-semibold text-black hover:bg-ppc-gold-dim"
        >
          + Add Player
        </button>
      </div>

      {importReport && (
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          {importReport}
        </p>
      )}

      <RosterTally tallies={buildTallies(orderMode, sets, entries)} />

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          No players yet. Add one, or import a CSV.
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[54rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-2">Name on back</th>
                  <th className="py-2 pr-2 w-20">#</th>
                  <th className="py-2 pr-2 w-28">Jersey</th>
                  <th className="py-2 pr-2 w-32">Sock</th>
                  <th className="py-2 pr-2 w-28">Pant</th>
                  {homeAway ? (
                    <>
                      <th className="py-2 pr-2 w-24">Home Jersey</th>
                      <th className="py-2 pr-2 w-24">Away Jersey</th>
                      <th className="py-2 pr-2 w-24">Home Socks</th>
                      <th className="py-2 pr-2 w-24">Away Socks</th>
                    </>
                  ) : (
                    <>
                      <th className="py-2 pr-2 w-20">Jerseys</th>
                      <th className="py-2 pr-2 w-20">Socks</th>
                    </>
                  )}
                  <th className="py-2 pr-2">Notes</th>
                  <th className="py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.id} className="border-b border-line/50 align-top">
                    <td className="py-2 pr-2">
                      <input
                        value={e.playerNameAsPrinted}
                        placeholder={e.sockOnly ? 'Sock only' : 'Player name'}
                        disabled={e.sockOnly}
                        onChange={(ev) =>
                          patch(i, {
                            playerNameAsPrinted: noSpaces
                              ? stripSpaces(ev.target.value)
                              : ev.target.value,
                          })
                        }
                      />
                      <div className="mt-1.5 flex gap-1.5">
                        <RowChip
                          active={e.isGoalie}
                          label="Goalie"
                          onClick={() => patch(i, { isGoalie: !e.isGoalie, sockOnly: false })}
                        />
                        <RowChip
                          active={e.sockOnly}
                          label="Sock only"
                          onClick={() =>
                            patch(i, {
                              sockOnly: !e.sockOnly,
                              isGoalie: false,
                              jerseySize: '',
                              jerseysPerPlayer: e.sockOnly ? 1 : 0,
                            })
                          }
                        />
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={e.number}
                        disabled={e.sockOnly}
                        onChange={(ev) => patch(i, { number: ev.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      {e.sockOnly ? (
                        <span className="text-xs text-muted">—</span>
                      ) : (
                        <SizeSelect
                          value={e.jerseySize}
                          options={JERSEY_SIZES}
                          onChange={(v) => patch(i, { jerseySize: v })}
                        />
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      <SizeSelect
                        value={e.sockSize}
                        options={SOCK_SIZES}
                        onChange={(v) => patch(i, { sockSize: v })}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <SizeSelect
                        value={e.pantShellSize}
                        options={PANT_SHELL_SIZES}
                        onChange={(v) => patch(i, { pantShellSize: v })}
                      />
                    </td>
                    {homeAway ? (
                      <>
                        <td className="py-2 pr-2">
                          <TickBox
                            checked={Boolean(e.homeJersey)}
                            disabled={e.sockOnly}
                            onChange={(v) => patch(i, { homeJersey: v ? 1 : 0 })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <TickBox
                            checked={Boolean(e.awayJersey)}
                            disabled={e.sockOnly}
                            onChange={(v) => patch(i, { awayJersey: v ? 1 : 0 })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <TickBox
                            checked={Boolean(e.homeSocks)}
                            onChange={(v) => patch(i, { homeSocks: v ? 1 : 0 })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <TickBox
                            checked={Boolean(e.awaySocks)}
                            onChange={(v) => patch(i, { awaySocks: v ? 1 : 0 })}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min={0}
                            value={e.jerseysPerPlayer}
                            disabled={e.sockOnly}
                            onChange={(ev) => patch(i, { jerseysPerPlayer: Number(ev.target.value) || 0 })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min={0}
                            value={e.socksPerPlayer}
                            onChange={(ev) => patch(i, { socksPerPlayer: Number(ev.target.value) || 0 })}
                          />
                        </td>
                      </>
                    )}
                    <td className="py-2 pr-2">
                      <input value={e.notes} onChange={(ev) => patch(i, { notes: ev.target.value })} />
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removePlayer(i)}
                        aria-label="Remove player"
                        className="rounded px-2 py-1 text-muted hover:bg-red-500/10 hover:text-red-300"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: cards, not a sideways-scrolling table. This gets used at a rink. */}
          <div className="space-y-3 md:hidden">
            {entries.map((e, i) => (
              <div key={e.id} className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-muted">Player {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removePlayer(i)}
                    className="rounded px-2 py-1 text-xs text-muted hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-2 flex gap-1.5">
                  <RowChip
                    active={e.isGoalie}
                    label="Goalie"
                    onClick={() => patch(i, { isGoalie: !e.isGoalie, sockOnly: false })}
                  />
                  <RowChip
                    active={e.sockOnly}
                    label="Sock only"
                    onClick={() =>
                      patch(i, {
                        sockOnly: !e.sockOnly,
                        isGoalie: false,
                        jerseySize: '',
                        jerseysPerPlayer: e.sockOnly ? 1 : 0,
                      })
                    }
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    className="col-span-2"
                    value={e.playerNameAsPrinted}
                    placeholder={e.sockOnly ? 'Sock only' : 'Name on back'}
                    disabled={e.sockOnly}
                    onChange={(ev) =>
                      patch(i, {
                        playerNameAsPrinted: noSpaces ? stripSpaces(ev.target.value) : ev.target.value,
                      })
                    }
                  />
                  <input
                    value={e.number}
                    placeholder="#"
                    disabled={e.sockOnly}
                    onChange={(ev) => patch(i, { number: ev.target.value })}
                  />
                  {!e.sockOnly && (
                    <SizeSelect
                      value={e.jerseySize}
                      options={JERSEY_SIZES}
                      onChange={(v) => patch(i, { jerseySize: v })}
                    />
                  )}
                  <SizeSelect
                    value={e.sockSize}
                    options={SOCK_SIZES}
                    onChange={(v) => patch(i, { sockSize: v })}
                  />
                  {homeAway ? (
                    <div className="col-span-2 grid grid-cols-2 gap-2">
                      <LabelledTick
                        label="Home Jersey" checked={Boolean(e.homeJersey)} disabled={e.sockOnly}
                        onChange={(v) => patch(i, { homeJersey: v ? 1 : 0 })}
                      />
                      <LabelledTick
                        label="Away Jersey" checked={Boolean(e.awayJersey)} disabled={e.sockOnly}
                        onChange={(v) => patch(i, { awayJersey: v ? 1 : 0 })}
                      />
                      <LabelledTick
                        label="Home Socks" checked={Boolean(e.homeSocks)}
                        onChange={(v) => patch(i, { homeSocks: v ? 1 : 0 })}
                      />
                      <LabelledTick
                        label="Away Socks" checked={Boolean(e.awaySocks)}
                        onChange={(v) => patch(i, { awaySocks: v ? 1 : 0 })}
                      />
                    </div>
                  ) : (
                    <div className="col-span-2 grid grid-cols-2 gap-2">
                      <label className="text-xs text-muted">
                        Jerseys
                        <input
                          type="number" min={0} value={e.jerseysPerPlayer} disabled={e.sockOnly}
                          onChange={(ev) => patch(i, { jerseysPerPlayer: Number(ev.target.value) || 0 })}
                        />
                      </label>
                      <label className="text-xs text-muted">
                        Socks
                        <input
                          type="number" min={0} value={e.socksPerPlayer}
                          onChange={(ev) => patch(i, { socksPerPlayer: Number(ev.target.value) || 0 })}
                        />
                      </label>
                    </div>
                  )}
                  <input
                    value={e.notes}
                    placeholder="Notes"
                    className="col-span-2"
                    onChange={(ev) => patch(i, { notes: ev.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RowChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1 text-[0.7rem] font-bold uppercase tracking-wide ${
        active ? 'bg-ppc-gold text-black' : 'bg-surface text-muted hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function TickBox({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-9 w-full items-center justify-center rounded-lg border text-sm font-bold transition-colors disabled:opacity-30 ${
        checked
          ? 'border-ppc-gold bg-ppc-gold/15 text-ppc-gold'
          : 'border-line bg-surface-2 text-muted hover:border-ppc-gold/50'
      }`}
    >
      {checked ? '✓' : '—'}
    </button>
  );
}

function LabelledTick({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors disabled:opacity-30 ${
        checked
          ? 'border-ppc-gold bg-ppc-gold/15 text-ppc-gold'
          : 'border-line bg-surface text-muted'
      }`}
    >
      <span>{label}</span>
      <span>{checked ? '✓' : '—'}</span>
    </button>
  );
}
