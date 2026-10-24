'use client';

import { PANT_SHELL_SIZES, SOCK_SIZES, jerseySizesFor } from '@/lib/constants';
import { coverageNote, isGoalieCut, sizeBreakdown, sizeCoverage, sizedRows, type SizeCoverage } from '@/lib/roster-edit';
import type { ExtraJersey, OrderMode, RosterEntry, SetQuantities } from '@/lib/types';
import { sizeLabel } from './fields';

/**
 * Size breakdown, above the roster.
 *
 * "How many larges?" is the question the factory asks, and answering it meant
 * counting a column of twenty dropdowns by eye — the kind of count that goes
 * wrong on the one order you're rushing.
 *
 * The warning is about the ORDER, not the rows. Twenty-five people listed and
 * twenty pairs of socks ordered means five blank sock sizes are correct, so
 * "No size ×5" was crying wolf. What's flagged instead is the sized count
 * against the ordered count: under it (something still needs a size), over
 * it (more sized than will be made), and nothing at all when they match.
 * Rules in lib/roster-edit.ts (`sizeCoverage`, `coverageNote`), tested; this
 * file only draws them.
 *
 * Separate from RosterTally on purpose. The tally answers "does the roster add
 * up to what was ordered"; this answers "what does the cut sheet say".
 */

function Group({
  label,
  values,
  order,
  coverage,
}: {
  label: string;
  values: string[];
  order: readonly string[];
  coverage: SizeCoverage;
}) {
  const { buckets } = sizeBreakdown(values, order);
  const note = coverageNote(coverage);
  const nothingOrdered = coverage.ordered <= 0;

  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-ppc-gold">{label}</span>
        <span className="text-xs text-muted">
          {nothingOrdered ? `${coverage.sized} sized` : `${coverage.sized} of ${coverage.ordered} sized`}
          {coverage.extras ? ` · incl. ${coverage.extras} extra${coverage.extras === 1 ? '' : 's'}` : ''}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {buckets.map((b) => (
          <span key={b.size} className="rounded border border-line bg-surface px-2 py-1 text-xs font-semibold tabular-nums">
            {sizeLabel(b.size)} <span className="text-ppc-gold">&times;{b.count}</span>
          </span>
        ))}
        {/*
          * Short of the order is the thing to chase, so it's red. Over the
          * order is worth a look but nobody's jersey is missing, so amber.
          * Matching the order says nothing — a green tick on every group is
          * noise that teaches you to skip the one that isn't.
          */}
        {note?.kind === 'under' && (
          <span className="rounded border border-red-500/50 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-300 tabular-nums">
            {note.count} still to size
          </span>
        )}
        {note?.kind === 'over' && (
          <span className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-200 tabular-nums">
            {note.count} more sized than ordered
          </span>
        )}
        {buckets.length === 0 && !note && <span className="text-xs text-muted">Nothing to size yet.</span>}
      </div>
    </div>
  );
}

export function RosterBreakdown({
  entries,
  mode,
  sets,
  showSocks,
  showPantShells,
  spares = [],
}: {
  entries: RosterEntry[];
  /** The spares from Order Totals: counted and sized with the roster (2026-10-23). */
  spares?: ExtraJersey[];
  /** The order's mode and sets: what was ordered is what the sizes are checked against. */
  mode: OrderMode;
  sets: SetQuantities[];
  showSocks: boolean;
  showPantShells: boolean;
}) {
  if (entries.length === 0 && spares.length === 0) return null;

  const jerseyRows = sizedRows(entries, 'jersey');
  // A goalie cut is its own garment: by the size picked, else by the flag.
  const goalies = jerseyRows.filter(isGoalieCut);
  const skaters = jerseyRows.filter((e) => !isGoalieCut(e));
  const cov = sizeCoverage(entries, mode, sets, spares);
  // One size per spare, as one per player: a spare is one skater (2026-10-24).
  const spareJerseySizes = spares.filter((x) => !x.sockOnly && x.size.trim()).map((x) => x.size);
  const spareSockSizes = spares.filter((x) => x.sockSize.trim()).map((x) => x.sockSize);

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="mb-2 text-sm font-bold">Size Breakdown</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/*
          * Goalie cuts are their own garment with their own size list, so they
          * are counted apart whenever there is one. A Goalie XL lumped in with
          * the skaters' XLs is a cut sheet that's wrong in a way nobody notices
          * until the box arrives.
          */}
        {goalies.length > 0 || cov.goalieJersey.ordered > 0 ? (
          <>
            <Group label="Skater Jerseys" values={[...skaters.map((e) => e.jerseySize), ...spareJerseySizes]} order={jerseySizesFor(false)} coverage={cov.skaterJersey} />
            <Group label="Goalie Jerseys" values={goalies.map((e) => e.jerseySize)} order={jerseySizesFor(true)} coverage={cov.goalieJersey} />
          </>
        ) : (
          <Group
            label="Jerseys"
            values={[...jerseyRows.map((e) => e.jerseySize), ...spareJerseySizes]}
            order={jerseySizesFor(false)}
            coverage={{
              ordered: cov.skaterJersey.ordered + cov.goalieJersey.ordered,
              sized: cov.skaterJersey.sized + cov.goalieJersey.sized,
              extras: cov.skaterJersey.extras,
            }}
          />
        )}
        {showSocks && (
          <Group label="Socks" values={[...sizedRows(entries, 'sock').map((e) => e.sockSize), ...spareSockSizes]} order={SOCK_SIZES} coverage={cov.sock} />
        )}
        {showPantShells && (
          <Group label="Pant Shells" values={sizedRows(entries, 'pant').map((e) => e.pantShellSize)} order={PANT_SHELL_SIZES} coverage={cov.pant} />
        )}
      </div>
    </div>
  );
}
