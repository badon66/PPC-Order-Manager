import { GOALIE_JERSEY_SIZES, PANT_SHELL_SIZES, PLAYER_JERSEY_SIZES, SOCK_SIZES } from '@/lib/constants';

/**
 * Size translation for roster imports.
 *
 * A team writes "Adult L", "YM", "Lrg", "2XL", "Goalie Large" — our roster
 * holds "Senior Large", "Youth S/M", "Goalie L". This file is the one place
 * those are matched up, and it works by fixed rules, not by guessing:
 *
 *   exact      already one of our sizes ("Senior Large")
 *   table      a fixed, unambiguous translation ("Adult L" → "Senior Large")
 *   blank      nothing given, or said so ("TBD", "-", "?")
 *   sockOnly   the jersey cell says this person gets socks only
 *   decide     can't be translated by rule: needs a person to choose. Comes
 *              with a suggestion when there is an obvious candidate, but the
 *              suggestion is never applied by itself.
 *
 * The cases that MUST go to a person, because a wrong guess becomes a jersey
 * that doesn't fit:
 *   - a bare letter ("L") when nothing in the column says whether the file
 *     means youth or adult sizes — a twelve-year-old's L and a man's L are not
 *     the same jersey. That one is decided once per column (see `bare`).
 *   - a goalie whose size has no goalie marker ("L" on a goalie's row). Goalie
 *     cuts are cut bigger; "L" might mean Goalie L or Goalie XL.
 *   - numbers (46, 52, 24") — they depend on whose size chart the team used.
 *   - age groups we don't sell in that garment (Junior, Intermediate, Youth
 *     pants), and anything else not recognised.
 *
 * Pure and tested (tests/roster-import/sizes.test.ts).
 */

export type SizeField = 'jerseySize' | 'sockSize' | 'pantSize';

/** How to read a bare letter in one column. Decided once, by Keenan, per column. */
export type BareReading = 'youth' | 'senior';

export type Translation =
  | { kind: 'exact'; value: string }
  | { kind: 'table'; value: string; note: string }
  | { kind: 'blank'; note?: string }
  | { kind: 'sockOnly' }
  /** A bare letter, and the column's reading hasn't been decided yet. */
  | { kind: 'needsBare' }
  | { kind: 'decide'; reason: string; suggestion?: string };

type Group = 'youth' | 'senior' | 'junior' | 'intermediate' | 'womens';
type Letter = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL' | 'XXXXL' | 'S/M' | 'L/XL';

export interface ParsedSize {
  goalie: boolean;
  group: Group | null;
  letter: Letter | null;
  /** A number or an inch size: "52", "24\"" — never translated by rule. */
  numeric: string | null;
  special: 'sockOnly' | 'blank' | null;
  /** Words we didn't recognise. Anything left over means "don't guess". */
  leftover: string;
}

/** Upper-case, accents and punctuation folded, spacing collapsed. Used as the key for a value decision too. */
export function normSize(raw: string): string {
  return (raw ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[’'`]/g, '')
    .replace(/[“”″]/g, '"')
    .replace(/(\d)\s*(INCHES|INCH|IN)\b/g, '$1"')
    .replace(/[_\-–—.,;:()[\]{}*]/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+"/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// No `g` flag on any of these: they're shared module state, and a global
// regex remembers where its last `test` stopped. `strip` makes a fresh one.
const GROUP_WORDS: Array<[RegExp, Group]> = [
  [/\b(YOUTH|YTH|KIDS?|CHILD|CHILDREN|CHILDS|BOYS|GIRLS)\b/, 'youth'],
  [/\b(ADULTS?|SENIOR|SR|MENS|MEN|MALE|UNISEX)\b/, 'senior'],
  [/\b(JUNIOR|JR|JNR)\b/, 'junior'],
  [/\b(INTERMEDIATE|INTER|INT)\b/, 'intermediate'],
  [/\b(WOMENS|WOMEN|LADIES|LADY|FEMALE)\b/, 'womens'],
];

const GOALIE_WORDS = /\b(GOALIE|GOALIES|GOALTENDER|GOALKEEPER|GOALIE CUT|GK|NETMINDER)\b/;

const strip = (s: string, re: RegExp) => s.replace(new RegExp(re.source, 'g'), ' ');

/** Every way a letter size gets written, mapped to one spelling. Longest first. */
const LETTER_WORDS: Array<[RegExp, Letter]> = [
  [/^(XXXXL|4XL|4X|XXXX LARGE|4X LARGE)$/, 'XXXXL'],
  [/^(XXXL|3XL|3X|XXX LARGE|3X LARGE|XXXLG)$/, 'XXXL'],
  [/^(XXL|2XL|2X|XX LARGE|2X LARGE|XXLARGE|XXLG|XXLRG)$/, 'XXL'],
  [/^(XL|X LARGE|XLARGE|EXTRA LARGE|XLG|XLRG|X LG)$/, 'XL'],
  [/^(XS|X SMALL|XSMALL|EXTRA SMALL|XSM|XXS)$/, 'XS'],
  [/^(L\/XL|LG\/XL|LARGE\/XL|LARGE\/X LARGE|L XL)$/, 'L/XL'],
  [/^(S\/M|SM\/MD|SM\/MED|SMALL\/MEDIUM|S M)$/, 'S/M'],
  [/^(L|LG|LRG|LARGE|LGE)$/, 'L'],
  [/^(M|MD|MED|MEDIUM|MDM)$/, 'M'],
  [/^(S|SM|SML|SMALL|SMLL)$/, 'S'],
];

/** "YM", "AL", "SRXL", "JRL": a group glued onto the letter. */
const GLUED: Array<[RegExp, Group]> = [
  [/^Y(XS|S|M|L|XL|SM|MD|LG|S\/M|L\/XL|XXL)$/, 'youth'],
  [/^A(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|SM|MD|LG)$/, 'senior'],
  [/^SR(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|SM|MD|LG)$/, 'senior'],
  [/^JR(XS|S|M|L|XL|SM|MD|LG)$/, 'junior'],
];

function letterOf(s: string): Letter | null {
  for (const [re, l] of LETTER_WORDS) if (re.test(s)) return l;
  return null;
}

/** Break a size cell into what it says. Never throws; unknown words land in `leftover`. */
export function parseSize(raw: string): ParsedSize {
  const out: ParsedSize = { goalie: false, group: null, letter: null, numeric: null, special: null, leftover: '' };
  let s = normSize(raw);

  if (!s || /^(TBD|TBA|N\/A|NA|NONE|NIL|UNKNOWN|NOT SURE|UNSURE|\?+|"+|-+)$/.test(s)) {
    out.special = 'blank';
    return out;
  }
  if (/\bSOCKS? ONLY\b|\bNO JERSEY\b|\bJUST SOCKS\b/.test(s)) {
    out.special = 'sockOnly';
    return out;
  }

  if (GOALIE_WORDS.test(s)) {
    out.goalie = true;
    s = strip(s, GOALIE_WORDS);
  }
  for (const [re, g] of GROUP_WORDS) {
    if (re.test(s)) {
      // Two different groups in one cell ("Youth/Adult L") is a contradiction, not a size.
      if (out.group && out.group !== g) { out.leftover = normSize(raw); return out; }
      out.group = g;
      s = strip(s, re);
    }
  }
  s = s.replace(/\bSIZE\b|\bSZ\b|\bCUT\b/g, ' ').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();

  if (!s) return out; // e.g. just "Goalie" or just "Youth": no size given

  for (const [re, g] of GLUED) {
    const m = s.match(re);
    if (m) {
      if (out.group && out.group !== g) { out.leftover = normSize(raw); return out; }
      out.group = g;
      s = m[1];
      break;
    }
  }

  // A lone "Y" or "A" left in front: "Y L", "A XL".
  const spaced = s.match(/^(Y|A)\s+(.+)$/);
  if (spaced) {
    const g: Group = spaced[1] === 'Y' ? 'youth' : 'senior';
    if (out.group && out.group !== g) { out.leftover = normSize(raw); return out; }
    out.group = g;
    s = spaced[2];
  }

  const letter = letterOf(s);
  if (letter) {
    out.letter = letter;
    return out;
  }
  if (/^\d{1,3}(\/\d{1,3})?"?$/.test(s) || /^\d{1,2}-\d{1,2}"?$/.test(s)) {
    out.numeric = s;
    return out;
  }
  out.leftover = s;
  return out;
}

const SENIOR_JERSEY: Partial<Record<Letter, string>> = {
  S: 'Senior Small', M: 'Senior Medium', L: 'Senior Large',
  XL: 'Senior XL', XXL: 'Senior XXL', XXXL: 'Senior XXXL',
};
const YOUTH_JERSEY: Partial<Record<Letter, string>> = {
  S: 'Youth S/M', M: 'Youth S/M', 'S/M': 'Youth S/M',
  L: 'Youth L/XL', XL: 'Youth L/XL', 'L/XL': 'Youth L/XL',
};
const GOALIE_JERSEY: Partial<Record<Letter, string>> = {
  S: 'Goalie S/M', M: 'Goalie S/M', 'S/M': 'Goalie S/M',
  L: 'Goalie L', XL: 'Goalie XL', XXL: 'Goalie 2XL', XXXL: 'Goalie 3XL',
};
const SOCK: Partial<Record<Letter, string>> = {
  S: 'Small', M: 'Medium', L: 'Large', XL: 'XL', XXL: 'XXL', XXXL: 'XXXL',
};
const PANT: Partial<Record<Letter, string>> = {
  S: 'Senior Small', M: 'Senior Medium', L: 'Senior Large', XL: 'Senior XL', XXL: 'Senior XXL',
};

function exactIn(list: readonly string[], raw: string): string | null {
  const k = normSize(raw);
  return list.find((x) => normSize(x) === k) ?? null;
}

/** Every size a field can hold, for the decision dropdowns. Jersey sizes depend on whether the row is a goalie. */
export function sizeOptions(field: SizeField, goalie: boolean): readonly string[] {
  if (field === 'sockSize') return SOCK_SIZES;
  if (field === 'pantSize') return PANT_SHELL_SIZES;
  return goalie ? GOALIE_JERSEY_SIZES : PLAYER_JERSEY_SIZES;
}

function describe(raw: string, value: string): string {
  return `"${raw.trim()}" → ${value}`;
}

/**
 * Translate one cell.
 *
 * `goalieRow` is whether this person is a goalie by some OTHER column (a
 * position of G, a goalie tick). A goalie marker inside the size itself counts
 * on its own, and the caller can use `parseSize(raw).goalie` to mark the row.
 *
 * `bare` is the column's decided reading of bare letters, or undefined when it
 * hasn't been decided.
 */
export function translateSize(
  field: SizeField,
  raw: string,
  opts: { goalieRow: boolean; bare?: BareReading },
): Translation {
  const text = (raw ?? '').trim();
  const p = parseSize(text);

  if (p.special === 'blank') return text ? { kind: 'blank', note: `"${text}" — left blank` } : { kind: 'blank' };
  if (p.special === 'sockOnly') {
    return field === 'jerseySize'
      ? { kind: 'sockOnly' }
      : { kind: 'decide', reason: `"${text}" in a ${label(field)} column` };
  }

  const goalie = opts.goalieRow || p.goalie;

  // Already ours, spelled our way. Still checked against the row: a goalie
  // can't wear a player cut, and a skater can't wear a goalie cut.
  if (field === 'jerseySize') {
    const asPlayer = exactIn(PLAYER_JERSEY_SIZES, text);
    const asGoalie = exactIn(GOALIE_JERSEY_SIZES, text);
    if (asGoalie) return { kind: 'exact', value: asGoalie };
    if (asPlayer && !goalie) return { kind: 'exact', value: asPlayer };
    if (asPlayer && goalie) {
      return { kind: 'decide', reason: `a goalie with a player size ("${text}")`, suggestion: goalieSuggestion(p.letter) };
    }
  } else {
    const hit = exactIn(field === 'sockSize' ? SOCK_SIZES : PANT_SHELL_SIZES, text);
    if (hit) {
      if (field === 'pantSize' && goalie && hit !== 'Senior Goalie') {
        return { kind: 'decide', reason: `a goalie with a skater's pant size ("${text}")`, suggestion: 'Senior Goalie' };
      }
      return { kind: 'exact', value: hit };
    }
  }

  if (p.leftover) return { kind: 'decide', reason: `"${text}" isn't a size we can read` };
  if (p.numeric) return { kind: 'decide', reason: `"${text}" is a number size — it depends on whose size chart they used` };

  // Two sizes that need no letter: goalie pants come in one size, and a
  // youth goalie gets our one junior goalie cut.
  if (field === 'pantSize' && p.goalie) return { kind: 'table', value: 'Senior Goalie', note: describe(text, 'Senior Goalie') };
  if (field === 'jerseySize' && goalie && (p.group === 'youth' || p.group === 'junior')) {
    return { kind: 'table', value: 'Junior Goalie', note: describe(text, 'Junior Goalie') };
  }

  if (!p.letter) {
    return { kind: 'decide', reason: `"${text}" has no size in it`, suggestion: field === 'pantSize' && goalie ? 'Senior Goalie' : undefined };
  }

  if (field === 'sockSize') {
    if (p.group && p.group !== 'senior') {
      return { kind: 'decide', reason: `"${text}" — our socks are sized S to XXXL, not by age group` };
    }
    const v = SOCK[p.letter];
    return v ? { kind: 'table', value: v, note: describe(text, v) } : { kind: 'decide', reason: `no ${p.letter} sock` };
  }

  if (field === 'pantSize') {
    if (goalie) return { kind: 'decide', reason: `a goalie with a skater's pant size ("${text}")`, suggestion: 'Senior Goalie' };
    if (p.group && p.group !== 'senior') {
      return { kind: 'decide', reason: `"${text}" — pant shells only come in senior sizes` };
    }
    if (!p.group) {
      if (!opts.bare) return { kind: 'needsBare' };
      if (opts.bare === 'youth') return { kind: 'decide', reason: `youth "${text}" — pant shells only come in senior sizes` };
    }
    const v = PANT[p.letter];
    return v ? { kind: 'table', value: v, note: describe(text, v) } : { kind: 'decide', reason: `no ${p.letter} pant shell` };
  }

  // Jerseys.
  if (goalie) {
    if (!p.goalie) {
      // The row is a goalie but the size doesn't say goalie cut. Never assumed.
      return { kind: 'decide', reason: `a goalie listed as "${text}" — which goalie cut?`, suggestion: goalieSuggestion(p.letter) };
    }
    const v = GOALIE_JERSEY[p.letter];
    return v ? { kind: 'table', value: v, note: describe(text, v) } : { kind: 'decide', reason: `no goalie ${p.letter}` };
  }

  const group = p.group ?? (opts.bare ?? null);
  if (!p.group && !opts.bare) return { kind: 'needsBare' };
  if (group === 'youth') {
    const v = YOUTH_JERSEY[p.letter];
    return v
      ? { kind: 'table', value: v, note: describe(text, v) }
      : { kind: 'decide', reason: `no youth ${p.letter} — youth sizes are S/M and L/XL`, suggestion: p.letter === 'XS' ? 'Youth S/M' : undefined };
  }
  if (group === 'senior') {
    const v = SENIOR_JERSEY[p.letter];
    return v ? { kind: 'table', value: v, note: describe(text, v) } : { kind: 'decide', reason: `no senior ${p.letter}` };
  }
  return { kind: 'decide', reason: `"${text}" — ${group} sizing doesn't match one of ours` };
}

function goalieSuggestion(letter: Letter | null): string | undefined {
  return letter ? GOALIE_JERSEY[letter] : undefined;
}

function label(field: SizeField): string {
  return field === 'jerseySize' ? 'jersey size' : field === 'sockSize' ? 'sock size' : 'pant shell size';
}

/**
 * Does this column already tell us how to read its bare letters?
 *
 * If ANY value in the column is marked youth ("YM", "Youth L"), the people who
 * filled it in were marking youth sizes, so an unmarked "L" beside them is an
 * adult L. That is the one deduction made without asking. Anything else — a
 * column of plain letters, or adult markers mixed with plain letters — is
 * decided by a person.
 */
export function deduceBare(values: string[]): BareReading | null {
  return values.some((v) => parseSize(v).group === 'youth') ? 'senior' : null;
}

/** Whether a column holds any bare letters at all — if not, there's nothing to decide. */
export function hasBareLetters(values: string[]): boolean {
  return values.some((v) => {
    const p = parseSize(v);
    return !p.special && !p.goalie && !p.group && p.letter !== null && !p.leftover;
  });
}

/** The key a value decision is stored under: the same raw size in the same kind of row decides the same way. */
export function valueKey(field: SizeField, goalie: boolean, raw: string): string {
  return `${field}|${field === 'sockSize' ? '' : goalie ? 'g' : 'p'}|${normSize(raw)}`;
}
