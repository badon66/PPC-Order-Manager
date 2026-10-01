'use client';

import { useRef, useState } from 'react';
import { PANT_SHELL_SIZES, SOCK_SIZES, jerseySizesFor } from '@/lib/constants';
import {
  blankRosterEntry, nextRowClaims, orderIncludesPantShells, orderIncludesSocks, stripSpaces,
} from '@/lib/order-utils';
import {
  applyBulkPatch, isNoName, nextHomeAwayClaims, nextSelection, pruneSelection, selectionCut,
  type BulkPatch,
} from '@/lib/roster-edit';
import type { NameStyle, Order, OrderMode, RosterEntry, SetQuantities } from '@/lib/types';
import { SizeSelect } from './fields';
import { CaptaincyPicker } from '@/components/captaincy';
import { RosterTally, buildTallies } from './roster-tally';
import { RosterBreakdown } from './roster-breakdown';
import { RosterBulkEdit } from './roster-bulk-edit';

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
  sockType,
  pantShellType,
  nameStyle,
  onChange,
}: {
  orderId: string;
  entries: RosterEntry[];
  orderMode: OrderMode;
  sets: SetQuantities[];
  sockType: Order['sockType'];
  pantShellType: Order['pantShellType'];
  /** The order's name style. "No Letters" makes every blank row read as no-name. */
  nameStyle: NameStyle;
  onChange: (next: RosterEntry[]) => void;
}) {
  const homeAway = orderMode === 'home_away_set';
  const noLetters = nameStyle === 'none';

  /*
   * Selection, for shift-click and bulk edit.
   *
   * A set of row ids, never indexes: removing a row above a selected one must
   * not slide the selection onto the next player. `anchor` is the last row
   * clicked, which is where a shift-click range starts from.
   */
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const ids = entries.map((e) => e.id);

  function clickRow(id: string, shift: boolean) {
    setSelected((cur) => nextSelection(cur, ids, id, anchor, shift));
    setAnchor(id);
  }
  function selectAll(on: boolean) {
    setSelected(on ? new Set(ids) : new Set());
    setAnchor(null);
  }
  const allSelected = entries.length > 0 && selected.size === entries.length;

  function applyBulk(patch: BulkPatch) {
    const cut = selectionCut(entries, selected);
    onChange(applyBulkPatch(entries, selected, patch, cut === 'goalies' ? true : cut === 'skaters' ? false : null));
    setBulkOpen(false);
  }

  // Columns for things this order doesn't include are hidden outright rather
  // than left blank: an empty sock-size cell on a jerseys-only order looks
  // like something that still needs filling in.
  const includes = { sets, sockType, pantShellType };
  const showSocks = orderIncludesSocks(includes);
  const showPantShells = orderIncludesPantShells(includes);
  const [noSpaces, setNoSpaces] = useState(false);
  const [allCaps, setAllCaps] = useState(false);

  /*
   * Both name toggles run through one function, in a fixed order.
   *
   * Applied separately they'd fight over the same field — typing with both on
   * would strip spaces, then uppercase, then on the next keystroke strip
   * again, and the result would depend on which handler ran last.
   */
  const formatName = (v: string) => {
    const stripped = noSpaces ? stripSpaces(v) : v;
    return allCaps ? stripped.toUpperCase() : stripped;
  };
  const [importReport, setImportReport] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function patch(i: number, p: Partial<RosterEntry>) {
    onChange(entries.map((e, idx) => (idx === i ? { ...e, ...p } : e)));
  }

  function addPlayer() {
    /*
     * A new row takes one of each only while the order still has some left.
     * Fifteen players against twelve pairs of socks means rows 13–15 start
     * with none, rather than over-assigning and leaving the tally demanding
     * socks nobody ordered.
     */
    onChange([
      ...entries,
      blankRosterEntry(
        orderId,
        entries.length,
        nextRowClaims({ sets }, entries),
        // Home/away: every box the order still has quantity for starts ticked,
        // instead of four empty boxes to click on every player.
        homeAway ? nextHomeAwayClaims(sets, entries) : {},
      ),
    ]);
  }

  function removePlayer(i: number) {
    const next = entries.filter((_, idx) => idx !== i).map((e, idx) => ({ ...e, sortOrder: idx }));
    onChange(next);
    setSelected((cur) => pruneSelection(cur, next.map((e) => e.id)));
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

        {selected.size > 0 && (
          <>
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="rounded-lg border border-ppc-gold bg-ppc-gold/10 px-3 py-2 text-sm font-semibold text-ppc-gold"
            >
              Edit {selected.size} selected
            </button>
            <button
              type="button"
              onClick={() => selectAll(false)}
              className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-semibold text-muted hover:text-foreground"
            >
              Clear
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => {
            const next = !noSpaces;
            setNoSpaces(next);
            // Switching on applies to what's already typed, not just to what
            // comes next — otherwise the toggle looks broken on a full roster.
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

        <button
          type="button"
          title="Print every name on the back in capitals"
          onClick={() => {
            const next = !allCaps;
            setAllCaps(next);
            if (next) {
              onChange(
                entries.map((e) => ({
                  ...e,
                  playerNameAsPrinted: e.playerNameAsPrinted.toUpperCase(),
                })),
              );
            }
          }}
          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
            allCaps ? 'border-ppc-gold bg-ppc-gold/10 text-ppc-gold' : 'border-line bg-surface-2'
          }`}
        >
          ALL CAPS
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

      {noLetters && (
        <p className="rounded-lg border border-ppc-gold/40 bg-ppc-gold/5 px-3 py-2 text-xs text-muted">
          <span className="font-semibold text-ppc-gold">No Letters is on for this order.</span> Any row
          without a name typed goes out with no name on the back. Rows that do have a name are left
          as you set them.
        </p>
      )}

      <RosterBreakdown entries={entries} showSocks={showSocks} showPantShells={showPantShells} />

      <RosterTally
        tallies={buildTallies(orderMode, sets, entries, {
          socks: showSocks,
          pantShells: showPantShells,
        })}
      />

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
                  <th className="w-8 py-2 pr-2">
                    <input
                      type="checkbox"
                      aria-label={allSelected ? 'Deselect all players' : 'Select all players'}
                      checked={allSelected}
                      onChange={(e) => selectAll(e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-[var(--color-ppc-gold)]"
                    />
                  </th>
                  <th className="py-2 pr-2">Name on back</th>
                  <th className="py-2 pr-2 w-20">#</th>
                  <th className="py-2 pr-2 w-28">Jersey</th>
                  {showSocks && <th className="py-2 pr-2 w-32">Sock</th>}
                  {showPantShells && <th className="py-2 pr-2 w-28">Pant</th>}
                  {homeAway ? (
                    <>
                      <th className="py-2 pr-2 w-24">Home Jersey</th>
                      <th className="py-2 pr-2 w-24">Away Jersey</th>
                      {showSocks && <th className="py-2 pr-2 w-24">Home Socks</th>}
                      {showSocks && <th className="py-2 pr-2 w-24">Away Socks</th>}
                    </>
                  ) : (
                    <>
                      <th className="py-2 pr-2 w-20">Jerseys</th>
                      {showSocks && <th className="py-2 pr-2 w-20">Socks</th>}
                    </>
                  )}
                  <th className="py-2 pr-2">Notes</th>
                  <th className="py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const noName = isNoName(e, nameStyle);
                  // Derived (No Letters + blank), as opposed to ticked by hand.
                  const impliedNoName = noName && !e.noName;
                  return (
                  <tr
                    key={e.id}
                    className={`border-b border-line/50 align-top ${selected.has(e.id) ? 'bg-ppc-gold/5' : ''}`}
                  >
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${e.playerNameAsPrinted || `player ${i + 1}`}`}
                        checked={selected.has(e.id)}
                        /*
                         * Shift is read off the click that produced this change.
                         * onChange is the right event for a controlled checkbox,
                         * and the native event behind it is the mouse click.
                         */
                        onChange={(ev) => clickRow(e.id, (ev.nativeEvent as MouseEvent).shiftKey)}
                        className="mt-2.5 h-4 w-4 cursor-pointer accent-[var(--color-ppc-gold)]"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={e.playerNameAsPrinted}
                        placeholder={e.sockOnly ? 'Sock only' : noName ? 'No name on back' : 'Player name'}
                        disabled={e.sockOnly}
                        className={noName ? 'italic' : ''}
                        onChange={(ev) =>
                          patch(i, {
                            playerNameAsPrinted: formatName(ev.target.value),
                          })
                        }
                      />
                      <div className="mt-1.5 flex gap-1.5">
                        <RowChip
                          active={e.isGoalie}
                          label="Goalie"
                          onClick={() => patch(i, { isGoalie: !e.isGoalie, sockOnly: false })}
                        />
                        {!e.sockOnly && (
                          <RowChip
                            active={noName}
                            dim={impliedNoName}
                            title={
                              impliedNoName
                                ? 'No Letters is on and this row has no name typed. Type a name to print one, or tick to make it explicit.'
                                : noName
                                  ? 'No name on the back. Untick to print the name.'
                                  : 'Leave the back blank for this player.'
                            }
                            label="No name"
                            onClick={() => patch(i, { noName: !e.noName })}
                          />
                        )}
                        <RowChip
                          active={e.sockOnly}
                          label="Sock only"
                          onClick={() =>
                            patch(i, {
                              sockOnly: !e.sockOnly,
                              isGoalie: false,
                              captaincy: '',
                              jerseySize: '',
                              jerseysPerPlayer: e.sockOnly ? 1 : 0,
                            })
                          }
                        />
                        {!e.sockOnly && (
                          <CaptaincyPicker
                            value={e.captaincy}
                            onChange={(v) => patch(i, { captaincy: v })}
                          />
                        )}
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
                          options={jerseySizesFor(e.isGoalie)}
                          onChange={(v) => patch(i, { jerseySize: v })}
                        />
                      )}
                    </td>
                    {showSocks && (
                      <td className="py-2 pr-2">
                        <SizeSelect
                          value={e.sockSize}
                          options={SOCK_SIZES}
                          onChange={(v) => patch(i, { sockSize: v })}
                        />
                      </td>
                    )}
                    {showPantShells && (
                      <td className="py-2 pr-2">
                        <SizeSelect
                          value={e.pantShellSize}
                          options={PANT_SHELL_SIZES}
                          onChange={(v) => patch(i, { pantShellSize: v })}
                        />
                      </td>
                    )}
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
                        {showSocks && (
                          <td className="py-2 pr-2">
                            <TickBox
                              checked={Boolean(e.homeSocks)}
                              onChange={(v) => patch(i, { homeSocks: v ? 1 : 0 })}
                            />
                          </td>
                        )}
                        {showSocks && (
                          <td className="py-2 pr-2">
                            <TickBox
                              checked={Boolean(e.awaySocks)}
                              onChange={(v) => patch(i, { awaySocks: v ? 1 : 0 })}
                            />
                          </td>
                        )}
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
                        {showSocks && (
                          <td className="py-2 pr-2">
                            <input
                              type="number"
                              min={0}
                              value={e.socksPerPlayer}
                              onChange={(ev) => patch(i, { socksPerPlayer: Number(ev.target.value) || 0 })}
                            />
                          </td>
                        )}
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
                  );
                })}
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
                  {!e.sockOnly && (
                    <RowChip
                      active={isNoName(e, nameStyle)}
                      dim={isNoName(e, nameStyle) && !e.noName}
                      label="No name"
                      onClick={() => patch(i, { noName: !e.noName })}
                    />
                  )}
                  <RowChip
                    active={e.sockOnly}
                    label="Sock only"
                    onClick={() =>
                      patch(i, {
                        sockOnly: !e.sockOnly,
                        isGoalie: false,
                        captaincy: '',
                        jerseySize: '',
                        jerseysPerPlayer: e.sockOnly ? 1 : 0,
                      })
                    }
                  />
                  {!e.sockOnly && (
                    <CaptaincyPicker
                      value={e.captaincy}
                      onChange={(v) => patch(i, { captaincy: v })}
                    />
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    className="col-span-2"
                    value={e.playerNameAsPrinted}
                    placeholder={e.sockOnly ? 'Sock only' : 'Name on back'}
                    disabled={e.sockOnly}
                    onChange={(ev) =>
                      patch(i, {
                        playerNameAsPrinted: formatName(ev.target.value),
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
                      options={jerseySizesFor(e.isGoalie)}
                      onChange={(v) => patch(i, { jerseySize: v })}
                    />
                  )}
                  {showSocks && (
                    <SizeSelect
                      value={e.sockSize}
                      options={SOCK_SIZES}
                      onChange={(v) => patch(i, { sockSize: v })}
                    />
                  )}
                  {showPantShells && (
                    <SizeSelect
                      value={e.pantShellSize}
                      options={PANT_SHELL_SIZES}
                      onChange={(v) => patch(i, { pantShellSize: v })}
                    />
                  )}
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
                      {showSocks && (
                        <LabelledTick
                          label="Home Socks" checked={Boolean(e.homeSocks)}
                          onChange={(v) => patch(i, { homeSocks: v ? 1 : 0 })}
                        />
                      )}
                      {showSocks && (
                        <LabelledTick
                          label="Away Socks" checked={Boolean(e.awaySocks)}
                          onChange={(v) => patch(i, { awaySocks: v ? 1 : 0 })}
                        />
                      )}
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
                      {showSocks && (
                        <label className="text-xs text-muted">
                          Socks
                          <input
                            type="number" min={0} value={e.socksPerPlayer}
                            onChange={(ev) => patch(i, { socksPerPlayer: Number(ev.target.value) || 0 })}
                          />
                        </label>
                      )}
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

      {bulkOpen && selected.size > 0 && (
        <RosterBulkEdit
          count={selected.size}
          cut={selectionCut(entries, selected)}
          homeAway={homeAway}
          showSocks={showSocks}
          showPantShells={showPantShells}
          onApply={applyBulk}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}

function RowChip({
  active,
  label,
  onClick,
  dim = false,
  title,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  /** Active because of a rule, not a tick — shown lighter so the two read differently. */
  dim?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded px-2 py-1 text-[0.7rem] font-bold uppercase tracking-wide ${
        active
          ? dim
            ? 'bg-ppc-gold/40 text-black'
            : 'bg-ppc-gold text-black'
          : 'bg-surface text-muted hover:text-foreground'
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
