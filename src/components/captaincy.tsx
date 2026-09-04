import { captaincyLabel } from '@/lib/constants';
import type { Captaincy } from '@/lib/types';

/**
 * Captain's letter — the picker the team uses, and the badge everyone reads.
 *
 * No 'use client' here on purpose. The badge is rendered from server
 * components (the share page, the order sheet) and the picker only ever from
 * modules that already declare 'use client', so one file serves both without
 * dragging the badge into the client bundle.
 */

const OPTIONS: Array<Exclude<Captaincy, ''>> = ['C', 'A'];

export function CaptaincyPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Captaincy;
  onChange: (next: Captaincy) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Captain's letter"
      className="inline-flex overflow-hidden rounded border border-line"
    >
      {OPTIONS.map((letter) => {
        const active = value === letter;
        return (
          <button
            key={letter}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            title={`${captaincyLabel(letter)} — tap again to clear`}
            // Tapping the letter that's already on clears it, so a mistake
            // doesn't need a third "none" button to undo.
            onClick={() => onChange(active ? '' : letter)}
            className={`w-7 py-1 text-[0.7rem] font-bold leading-none transition-colors ${
              active ? 'bg-ppc-gold text-black' : 'bg-surface text-muted hover:text-fg'
            } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
}

/**
 * How a letter reads in a roster list.
 *
 * Spelled out rather than shown as a bare letter: these lists get read by
 * parents and team managers, and a lone "A" in a name column is a puzzle.
 */
export function CaptaincyBadge({ value }: { value: Captaincy | undefined | null }) {
  if (value !== 'C' && value !== 'A') return null;
  return (
    <span className="ml-2 rounded bg-ppc-gold/15 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-ppc-gold">
      {captaincyLabel(value)}
    </span>
  );
}

/** The goalie marker, spelled out for the same reason. */
export function GoalieBadge() {
  return (
    <span className="ml-2 rounded bg-sky-500/15 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-sky-300">
      Goalie
    </span>
  );
}
