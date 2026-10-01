'use client';

import { PANT_SHELL_SIZES, SOCK_SIZES, jerseySizesFor } from '@/lib/constants';
import { sizeBreakdown, sizedRows } from '@/lib/roster-edit';
import type { RosterEntry } from '@/lib/types';

/**
 * Size breakdown, above the roster.
 *
 * "How many larges?" is the question the factory asks, and answering it meant
 * counting a column of twenty dropdowns by eye — the kind of count that goes
 * wrong on the one order you're rushing.
 *
 * Separate from RosterTally on purpose. The tally answers "does the roster add
 * up to what was ordered"; this answers "what does the cut sheet say". The
 * counting itself is `sizeBreakdown` in lib/roster-edit.ts, where it's tested;
 * this file only draws it.
 */

function Group({ label, values, order }: { label: string; values: string[]; order: readonly string[] }) {
  const { buckets, missing } = sizeBreakdown(values, order);
  const total = values.length - missing;

  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-ppc-gold">{label}</span>
        <span className="text-xs text-muted">{total} sized</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {buckets.map((b) => (
          <span key={b.size} className="rounded border border-line bg-surface px-2 py-1 text-xs font-semibold tabular-nums">
            {b.size} <span className="text-ppc-gold">&times;{b.count}</span>
          </span>
        ))}
        {/* An unsized row is the thing you want to see, so it's red, not absent. */}
        {missing > 0 && (
          <span className="rounded border border-red-500/50 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-300 tabular-nums">
            No size &times;{missing}
          </span>
        )}
        {buckets.length === 0 && missing === 0 && <span className="text-xs text-muted">Nothing to size yet.</span>}
      </div>
    </div>
  );
}

export function RosterBreakdown({
  entries,
  showSocks,
  showPantShells,
}: {
  entries: RosterEntry[];
  showSocks: boolean;
  showPantShells: boolean;
}) {
  if (entries.length === 0) return null;

  const jerseyRows = sizedRows(entries, 'jersey');
  const goalies = jerseyRows.filter((e) => e.isGoalie);
  const skaters = jerseyRows.filter((e) => !e.isGoalie);

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
        {goalies.length > 0 ? (
          <>
            <Group label="Skater Jerseys" values={skaters.map((e) => e.jerseySize)} order={jerseySizesFor(false)} />
            <Group label="Goalie Jerseys" values={goalies.map((e) => e.jerseySize)} order={jerseySizesFor(true)} />
          </>
        ) : (
          <Group label="Jerseys" values={jerseyRows.map((e) => e.jerseySize)} order={jerseySizesFor(false)} />
        )}
        {showSocks && (
          <Group label="Socks" values={sizedRows(entries, 'sock').map((e) => e.sockSize)} order={SOCK_SIZES} />
        )}
        {showPantShells && (
          <Group label="Pant Shells" values={sizedRows(entries, 'pant').map((e) => e.pantShellSize)} order={PANT_SHELL_SIZES} />
        )}
      </div>
    </div>
  );
}
