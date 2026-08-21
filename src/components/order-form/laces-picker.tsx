'use client';

import { LACES_IMAGES, LACES_LABELS } from '@/lib/constants';
import type { LacesStyle } from '@/lib/types';

/**
 * Lace style picker with real product photos.
 *
 * "Hanging" vs "Straight" vs "X" is the kind of thing that's obvious in a
 * picture and ambiguous in words — especially when a customer is describing
 * what they want over text. Photos are Keenan's own collar shots, in
 * public/laces/.
 */
export function LacesPicker({
  value,
  onChange,
}: {
  value: LacesStyle;
  onChange: (v: LacesStyle) => void;
}) {
  const options = Object.keys(LACES_LABELS) as LacesStyle[];

  return (
    <div>
      <span className="text-xs font-medium text-muted">Laces Style</span>
      <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              type="button"
              data-laces={opt}
              onClick={() => onChange(opt)}
              className={`overflow-hidden rounded-lg border text-left transition-colors ${
                active
                  ? 'border-ppc-gold bg-ppc-gold/10'
                  : 'border-line bg-surface-2 hover:border-ppc-gold/50'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={LACES_IMAGES[opt]}
                alt={`${LACES_LABELS[opt]} collar`}
                className="aspect-square w-full bg-white object-cover"
                loading="lazy"
              />
              <div
                className={`flex items-center justify-between gap-1 px-2.5 py-2 text-xs font-semibold ${
                  active ? 'text-ppc-gold' : ''
                }`}
              >
                {LACES_LABELS[opt]}
                {active && <span>✓</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
