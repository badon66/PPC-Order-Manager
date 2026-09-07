import type { LeadRating } from '@/lib/types';

/**
 * 1–5 stars. Display-only when `onChange` is absent (server pages), a picker
 * otherwise (client modules only — no 'use client' here on purpose, so the
 * badge version doesn't drag React client code into the table page).
 */
export function StarRating({
  value, onChange, size = 'sm', label = 'Lead rating',
}: { value: LeadRating | null; onChange?: (v: LeadRating | null) => void; size?: 'sm' | 'lg'; label?: string }) {
  const stars = [1, 2, 3, 4, 5] as const;
  const cls = size === 'lg' ? 'text-2xl' : 'text-sm';
  if (!onChange) {
    if (!value) return <span className="text-xs text-muted">—</span>;
    return (
      <span className={`${cls} tabular-nums text-ppc-gold`} aria-label={`${label}: ${value} of 5`}>
        {'★'.repeat(value)}<span className="text-line">{'★'.repeat(5 - value)}</span>
      </span>
    );
  }
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {stars.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          onClick={() => onChange(value === n ? null : n)}
          className={`${cls} leading-none transition-colors ${value && n <= value ? 'text-ppc-gold' : 'text-line hover:text-ppc-gold/60'}`}
        >
          ★
        </button>
      ))}
      {value && <span className="ml-1 text-xs text-muted">{value}/5</span>}
    </div>
  );
}
