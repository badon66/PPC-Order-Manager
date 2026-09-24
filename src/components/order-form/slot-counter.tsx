'use client';

import { useState } from 'react';

/**
 * Stretchable upload slots.
 *
 * Every upload group has a cap, and the caps are right nearly all the time —
 * a sponsor logo is a file and its alternate colourway, not five. But "nearly
 * all the time" is not "always": a team turns up with a third colourway, or a
 * crest arrives split across an extra file, and a cap that cannot bend turns a
 * ten-second job into a code change.
 *
 * So the counter itself is the control. Double-click "2/2" and it becomes
 * "2/3". No button, no settings screen, nothing on the page for the normal
 * case — the default stays the default, and the exception costs one gesture.
 *
 * Deliberately not persisted. The stretch is a decision about this order in
 * front of you right now, not a new rule; on the next load the section is back
 * to its designed cap. What *is* remembered is the files — `used` floors the
 * effective max, so a group left holding three files still reads "3/3" after a
 * reload rather than the nonsense "3/2".
 */

/** How far one section can be stretched past its designed cap, per page load. */
export const MAX_EXTRA_SLOTS = 6;

export interface Stretchable {
  /** The cap to enforce right now. Never below the number of files already in. */
  max: number;
  /** True once it has been stretched past the designed cap. */
  stretched: boolean;
  /** Double-click handler: one more slot, wrapping back to the cap at the top. */
  stretch: () => void;
}

export function useStretchableMax(base: number, used: number): Stretchable {
  const [extra, setExtra] = useState(0);
  return {
    max: Math.max(base + extra, used),
    stretched: extra > 0,
    // Wraps rather than stopping dead: overshooting by a click should be one
    // more click to fix, not a reload. It can never strand you below the files
    // already uploaded, because `used` floors the max above.
    stretch: () => setExtra((n) => (n >= MAX_EXTRA_SLOTS ? 0 : n + 1)),
  };
}

/**
 * The "2/3" counter. Double-click adds a slot.
 *
 * `select-none` matters more than it looks: without it a double-click
 * highlights the text instead of reading as a gesture.
 */
export function SlotCounter({
  used,
  max,
  stretched,
  onStretch,
  className = '',
}: {
  used: number;
  max: number;
  stretched: boolean;
  onStretch: () => void;
  className?: string;
}) {
  return (
    <span
      role="button"
      tabIndex={-1}
      onDoubleClick={onStretch}
      title={`${used} of ${max} files. Double-click to add a slot.`}
      aria-label={`${used} of ${max} files used. Double-click to add a slot.`}
      className={`cursor-pointer select-none rounded px-1 text-xs tabular-nums transition-colors ${
        stretched ? 'bg-ppc-gold/15 font-semibold text-ppc-gold' : 'text-muted hover:text-ppc-gold'
      } ${className}`}
    >
      {used}/{max}
    </span>
  );
}
