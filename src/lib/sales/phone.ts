/** Everything that isn't a digit is dropped. Extensions are kept as trailing digits — the caller sees the raw string too. */
export function phoneDigits(raw: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

/** 10 digits, or 11 starting with 1. */
export function isNorthAmerican(raw: string): boolean {
  const d = phoneDigits(raw);
  return d.length === 10 || (d.length === 11 && d.startsWith('1'));
}

/** `tel:` link, or null when there's nothing to dial. */
export function telHref(raw: string): string | null {
  const d = phoneDigits(raw);
  if (!d) return null;
  if (d.length === 10) return `tel:+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `tel:+${d}`;
  return `tel:${d}`;
}

/** `(705) 555-0142` for North American numbers; anything else as typed. */
export function phoneDisplay(raw: string): string {
  const d = phoneDigits(raw);
  const n = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  if (n.length !== 10) return (raw ?? '').trim();
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
}
