import { CSV_COLUMNS } from '@/lib/constants';
import { parseSize } from './sizes';
import type { Confidence, ImportField, RuleGuess } from './types';

/**
 * Which of their columns is which — by rules.
 *
 * This is one of two independent opinions on every column (the other is the
 * AI's). It looks at two things and says how sure it is:
 *
 *   the header   "Sock Size", "Jersey #", "Pos", "C/A"
 *   the values   all 1–99 → a number column; F/D/G → positions; S/M/L/XL →
 *                sizes; mostly blank with the odd C or A → captain letters
 *
 * The one thing values can never settle is WHICH garment a size column is:
 * jersey, sock and pant sizes are all S/M/L/XL. Only the header says, so a
 * size column without a garment in its header is `sizeUnknown` and a person
 * picks — that is exactly the jersey/sock/pant mix-up this exists to stop.
 *
 * And a column of single words is never assumed to be last names: "Jake,
 * Liam, Noah" are first names, and the rules can't tell. That one is low
 * confidence on purpose.
 *
 * Pure and tested (tests/roster-import/columns.test.ts).
 */

export function normHeader(raw: string): string {
  return (raw ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/#/g, ' # ')
    .replace(/[_\-./\\()[\]:?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface HeaderGuess {
  field: ImportField;
  strength: number;
  why: string;
}

const has = (h: string, ...words: string[]) => words.some((w) => new RegExp(`(^| )${w}( |$)`).test(h));

/** What the header alone says. Null when it says nothing we recognise. */
export function headerGuess(raw: string): HeaderGuess | null {
  const h = normHeader(raw);
  if (!h) return null;
  const said = `header says "${raw.trim()}"`;

  // Contact and admin columns first: "Parent Phone #" is not a jersey number.
  if (has(h, 'e mail', 'email', 'phone', 'cell', 'mobile', 'tel', 'parent', 'parents', 'guardian', 'mom', 'dad',
    'dob', 'birth', 'birthday', 'birthdate', 'age', 'address', 'street', 'city', 'province', 'state', 'postal', 'zip',
    'division', 'grade', 'paid', 'payment', 'amount', 'fee', 'cost', 'price', 'hometown', 'school', 'shoots',
    'height', 'weight', 'ht', 'wt', 'registration', 'id', 'hcr', 'hockey canada',
    // Quebec rosters, accents already folded away.
    'courriel', 'telephone', 'cellulaire', 'mere', 'pere', 'tuteur', 'naissance', 'adresse', 'ville', 'code postal',
    'paye', 'paiement', 'montant', 'frais', 'prix', 'ecole', 'taille du joueur', 'poids', 'inscription')) {
    return { field: 'ignore', strength: 0.85, why: `${said} — not something we print` };
  }

  // Garment sizes: the garment word is what matters.
  if (has(h, 'sock', 'socks', 'bas', 'chaussettes')) return { field: 'sockSize', strength: 0.95, why: said };
  if (has(h, 'pant', 'pants', 'shell', 'shells', 'breezer', 'breezers', 'girdle', 'culotte', 'culottes', 'pantalon', 'pantalons')) {
    return { field: 'pantSize', strength: 0.95, why: said };
  }

  const numberWord = has(h, '#', 'number', 'numbers', 'num', 'no', 'nos', 'nbr', 'numero', 'numeros');
  const nameWord = has(h, 'name', 'names', 'nameplate', 'lettering', 'nom', 'noms');
  const sizeWord = has(h, 'size', 'sizes', 'sz', 'grandeur', 'grandeurs', 'taille', 'tailles');
  const garment = has(h, 'jersey', 'jerseys', 'sweater', 'sweaters', 'shirt', 'shirts', 'top', 'tops', 'uniform', 'game', 'chandail', 'chandails', 'maillot', 'maillots');

  if (numberWord && !nameWord && !sizeWord) return { field: 'number', strength: 0.9, why: said };
  if (garment && sizeWord) return { field: 'jerseySize', strength: 0.95, why: said };
  if (sizeWord && !nameWord) return { field: 'sizeUnknown', strength: 0.6, why: `${said} — but not which garment` };

  // Name printed on the back, as opposed to who the player is.
  if (/name (on|for) (the )?(back|jersey|sweater|shirt)|back name|jersey name|name ?plate|name ?bar|printed name|name to print|jersey lettering|name as printed|player name as printed|nom (au|sur le) (dos|chandail)|nom a imprimer/.test(h)) {
    return { field: 'name', strength: 0.95, why: said };
  }
  if (has(h, 'first', 'given', 'fname', 'prenom') && !has(h, 'last')) return { field: 'firstName', strength: 0.9, why: said };
  if (has(h, 'last', 'surname', 'lname') || /family name|nom de famille/.test(h)) return { field: 'lastName', strength: 0.9, why: said };

  if (has(h, 'pos', 'position', 'positions', 'role')) return { field: 'position', strength: 0.9, why: said };
  if (has(h, 'goalie', 'goalies', 'goaltender', 'goalkeeper', 'gk', 'netminder', 'gardien', 'gardiens')) {
    return { field: 'goalie', strength: 0.8, why: said };
  }
  if (h === 'c a' || h === 'c or a' || h === 'a or c' || has(h, 'captain', 'captains', 'capt', 'captaincy', 'letter', 'letters', 'leadership', 'alternate', 'alternates', 'capitaine', 'capitaines', 'lettre', 'lettres')) {
    return { field: 'letter', strength: 0.9, why: said };
  }
  if (has(h, 'note', 'notes', 'comment', 'comments', 'remark', 'remarks', 'instructions', 'special', 'other', 'details', 'commentaire', 'commentaires', 'remarque', 'remarques')) {
    return { field: 'notes', strength: 0.7, why: said };
  }
  if (has(h, 'name', 'names', 'player', 'players', 'athlete', 'skater', 'skaters', 'participant', 'participants', 'roster', 'full name', 'nom', 'noms', 'joueur', 'joueurs', 'joueuse', 'joueuses')) {
    return { field: 'fullName', strength: 0.6, why: said };
  }
  if (garment) return { field: 'sizeUnknown', strength: 0.4, why: `${said} — a number or a size` };
  if (has(h, 'team', 'equipe')) return { field: 'ignore', strength: 0.7, why: said };
  return null;
}

/* ------------------------------------------------------------------ *
 * Values
 * ------------------------------------------------------------------ */

const POSITION = /^(f|d|g|c|w|lw|rw|ld|rd|fwd|fw|def|dman|d man|forward|forwards|defence|defense|defenseman|defenceman|goalie|goaltender|gk|g\/f|f\/d|d\/f|center|centre|wing|winger|utility|util|skater)$/i;
const LETTER = /^(c|a|capt|captain|alt|asst|alternate|assistant|\(c\)|\(a\))$/i;
const YESNO = /^(y|n|yes|no|x|✓|✔|true|false|1|0)$/i;
const NUMBER = /^#?\s*\d{1,2}$/;
const NAME_AND_NUMBER = /^(#?\d{1,2}\s*[-–,:]?\s*\D{2,}|\D{2,}?\s*[-–,:(]?\s*#?\d{1,2}\)?)$/;
const ALPHA_WORDS = /^[\p{L}'’.\- ]+$/u;

export interface ValueProfile {
  n: number;
  blankShare: number;
  number: number;
  position: number;
  letter: number;
  yesNo: number;
  size: number;
  goalieSize: number;
  youthSize: number;
  inchSize: number;
  multiWord: number;
  singleWord: number;
  nameAndNumber: number;
  contact: number;
  longText: number;
}

export function valueProfile(all: string[]): ValueProfile {
  const values = all.map((v) => (v ?? '').trim());
  const filled = values.filter(Boolean);
  const n = filled.length;
  const share = (pred: (v: string) => boolean) => (n === 0 ? 0 : filled.filter(pred).length / n);
  const sizeLike = (v: string) => {
    const p = parseSize(v);
    return !p.leftover && !p.special && (p.letter !== null || p.goalie || (p.numeric !== null && /"/.test(p.numeric)));
  };
  return {
    n,
    blankShare: values.length === 0 ? 1 : (values.length - n) / values.length,
    number: share((v) => NUMBER.test(v)),
    position: share((v) => POSITION.test(v)),
    letter: share((v) => LETTER.test(v)),
    yesNo: share((v) => YESNO.test(v)),
    size: share(sizeLike),
    goalieSize: share((v) => parseSize(v).goalie),
    youthSize: share((v) => parseSize(v).group === 'youth'),
    inchSize: share((v) => /"/.test(parseSize(v).numeric ?? '')),
    multiWord: share((v) => ALPHA_WORDS.test(v) && v.split(/\s+/).length >= 2 && !sizeLike(v) && !POSITION.test(v)),
    singleWord: share((v) => ALPHA_WORDS.test(v) && v.split(/\s+/).length === 1 && !sizeLike(v) && !POSITION.test(v) && !LETTER.test(v) && !YESNO.test(v)),
    nameAndNumber: share((v) => NAME_AND_NUMBER.test(v) && /\d/.test(v) && /\p{L}{2,}/u.test(v)),
    contact: share((v) => /@/.test(v) || /\d{3}\D{0,2}\d{3}\D{0,2}\d{4}/.test(v)),
    longText: share((v) => v.length > 30),
  };
}

function fromValues(p: ValueProfile): { field: ImportField; confidence: Confidence; why: string } {
  if (p.n === 0) return { field: 'ignore', confidence: 'low', why: 'the column is empty' };
  if (p.contact >= 0.5) return { field: 'ignore', confidence: 'medium', why: 'values look like emails or phone numbers' };
  if (p.number >= 0.8) return { field: 'number', confidence: 'medium', why: 'every value is a number from 0 to 99' };
  if (p.position >= 0.8) return { field: 'position', confidence: 'medium', why: 'values are positions (F, D, G…)' };
  if (p.letter >= 0.9 && p.blankShare >= 0.4) return { field: 'letter', confidence: 'medium', why: 'mostly blank, with the odd C or A' };
  if (p.inchSize >= 0.6) return { field: 'sockSize', confidence: 'medium', why: 'sizes in inches — sock lengths' };
  if (p.size >= 0.7) return { field: 'sizeUnknown', confidence: 'medium', why: 'values are sizes, but nothing says which garment' };
  if (p.nameAndNumber >= 0.7) return { field: 'nameAndNumber', confidence: 'medium', why: 'each value has a name and a number together' };
  if (p.multiWord >= 0.6) return { field: 'fullName', confidence: 'medium', why: 'values are two or more words — full names' };
  if (p.singleWord >= 0.8) return { field: 'name', confidence: 'low', why: 'single words — last names, or first names? Check.' };
  if (p.longText >= 0.5) return { field: 'notes', confidence: 'low', why: 'long free text' };
  return { field: 'ignore', confidence: 'low', why: "values don't look like anything we print" };
}

/**
 * The rules' opinion of one column.
 *
 * A strong header that the values agree with is high confidence. A strong
 * header the values contradict ("Number" over a column of names) is LOW —
 * something is off and a person should look.
 */
export function ruleGuess(header: string, values: string[]): RuleGuess {
  const hg = headerGuess(header);
  const p = valueProfile(values);
  const v = fromValues(p);

  if (!hg) return { field: v.field, confidence: v.confidence === 'medium' ? 'medium' : 'low', why: v.why };

  const contradicts = (() => {
    if (p.n === 0) return false;
    switch (hg.field) {
      case 'number': return p.number < 0.5;
      case 'jerseySize': case 'sockSize': case 'pantSize': case 'sizeUnknown':
        return p.size < 0.4 && p.number < 0.5 && p.inchSize < 0.4 && !(p.blankShare > 0.8);
      case 'position': return p.position < 0.6;
      case 'letter': return p.letter < 0.7;
      case 'goalie': return p.yesNo < 0.6 && p.position < 0.6;
      case 'firstName': case 'lastName': case 'name': return p.number > 0.5 || p.size > 0.5;
      case 'fullName': return p.number > 0.5 || p.size > 0.5;
      default: return false;
    }
  })();

  if (contradicts) {
    return { field: hg.field, confidence: 'low', why: `${hg.why}, but the values look different (${v.why})` };
  }

  // Header "Player"/"Name": the values say whether it's full names or one word.
  if (hg.field === 'fullName') {
    if (p.multiWord >= 0.6) return { field: 'fullName', confidence: 'high', why: `${hg.why} — first and last names` };
    if (p.nameAndNumber >= 0.7) return { field: 'nameAndNumber', confidence: 'medium', why: `${hg.why} — names with numbers in them` };
    if (p.singleWord >= 0.8) return { field: 'name', confidence: 'low', why: `${hg.why} — one word each: last names or first names? Check.` };
    return { field: 'fullName', confidence: 'low', why: hg.why };
  }

  // A "Jersey" header alone could be the number or the size; the values decide.
  if (hg.field === 'sizeUnknown' && hg.strength < 0.5) {
    if (p.number >= 0.8) return { field: 'number', confidence: 'medium', why: `${hg.why}: values are numbers` };
    if (p.size >= 0.7) return { field: 'jerseySize', confidence: 'medium', why: `${hg.why}: values are sizes` };
    return { field: 'sizeUnknown', confidence: 'low', why: hg.why };
  }

  if (hg.field === 'sizeUnknown') return { field: 'sizeUnknown', confidence: 'medium', why: hg.why };

  // A "Goalie" header over F/D/G values is a position column.
  if (hg.field === 'goalie' && p.position >= 0.8 && p.yesNo < 0.6) {
    return { field: 'position', confidence: 'medium', why: `${hg.why}, values are positions` };
  }

  const confidence: Confidence = hg.strength >= 0.8 ? 'high' : 'medium';
  return { field: hg.field, confidence, why: hg.why };
}

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

/**
 * Which row holds the headers. Files often open with a title ("Spring Hawks
 * 2026 — Roster") or a blank line; the header is the first row with at least
 * two cells we recognise. -1 when there isn't one, and the columns are read
 * by their values alone.
 */
export function detectHeaderRow(rows: string[][]): number {
  const limit = Math.min(rows.length, 15);
  let best = -1;
  let bestScore = 1;
  for (let r = 0; r < limit; r++) {
    const score = rows[r].filter((c) => {
      const g = headerGuess(c);
      return g !== null && g.strength >= 0.6;
    }).length;
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

const NOT_A_PLAYER = /^(total|totals|grand total|coach|coaches|head coach|asst coach|assistant coach|manager|team manager|trainer|staff|bench staff|team|roster|updated|last updated|page \d+|signature|date|season|tournament|team name|division)\b/i;

/**
 * Rows that look like something other than a player: a staff line, a total,
 * a note written into the sheet. Left out by default and shown, so a person
 * confirms — never dropped silently.
 */
export function suggestNotPlayers(rows: string[][], headerRow: number): number[] {
  const out: number[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const cells = rows[r].map((c) => (c ?? '').trim()).filter(Boolean);
    if (cells.length === 0) continue;
    if (NOT_A_PLAYER.test(cells[0])) out.push(r);
    else if (cells.length === 1 && cells[0].length > 30) out.push(r);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Our own CSV
 * ------------------------------------------------------------------ */

const OUR_FIELDS: Record<string, ImportField> = {
  'player name': 'name', number: 'number', goalie: 'goalie', letter: 'letter',
  'jersey size': 'jerseySize', 'sock size': 'sockSize', 'pant size': 'pantSize',
  'pant shell size': 'pantSize', jerseys: 'jerseysQty', socks: 'socksQty',
  'home jersey': 'homeJersey', 'away jersey': 'awayJersey',
  'home socks': 'homeSocks', 'away socks': 'awaySocks', notes: 'notes',
};

/** A file this app exported: the first seven headers are ours, in our order. */
export function isPowerplayCsv(headerCells: string[]): boolean {
  const ours = CSV_COLUMNS.slice(0, 7).map((c) => c.toLowerCase());
  const theirs = headerCells.slice(0, 7).map((c) => (c ?? '').trim().toLowerCase());
  return ours.every((c, i) => c === theirs[i] || (c === 'pant size' && theirs[i] === 'pant shell size'));
}

export function ourCsvGuesses(headerCells: string[]): RuleGuess[] {
  return headerCells.map((h) => {
    const f = OUR_FIELDS[(h ?? '').trim().toLowerCase()];
    return f
      ? { field: f, confidence: 'high', why: 'a Powerplay roster export' }
      : { field: 'ignore', confidence: 'high', why: 'not one of our columns' };
  });
}
