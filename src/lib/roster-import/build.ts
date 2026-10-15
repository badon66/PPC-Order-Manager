import { GOALIE_JERSEY_SIZES } from '@/lib/constants';
import { parsesAsNoName } from '@/lib/roster-edit';
import { blankRosterEntry, rosterSlotCount } from '@/lib/order-utils';
import type { NameStyle, OrderMode, RosterEntry, SetQuantities } from '@/lib/types';
import {
  deduceBare, hasBareLetters, parseSize, sizeOptions, translateSize, valueKey,
  type SizeField,
} from './sizes';
import {
  FIELD_LABELS, type ImportAnalysis, type ImportDecisions, type ImportField, type ImportIssue,
  type ImportResult, type ImportedRow, type PendingValue, type ResolvedColumn, type RowFields,
} from './types';

/**
 * From a read file and a person's decisions, to roster rows and a list of
 * everything still open.
 *
 * Deterministic: the same analysis and the same decisions give the same rows,
 * which is how the server re-checks an Accept instead of trusting the screen.
 *
 * Fail-safe by construction:
 *   - A column nobody has confirmed contributes NOTHING to any row. Its cells
 *     aren't half-used while the question is open.
 *   - Cells are copied, never retyped. Sizes go through the fixed table in
 *     sizes.ts; anything that table won't translate waits for a person.
 *   - A cell two readings disagreed on (PDF, photo) is a question until
 *     someone picks a reading.
 *   - Nothing uncertain is filled in. It's left blank and listed.
 */

export interface ImportContext {
  orderMode: OrderMode;
  sets: SetQuantities[];
  includesSocks: boolean;
  includesPantShells: boolean;
  nameStyle: NameStyle;
  teamName: string;
}

const SINGLETON: ReadonlySet<ImportField> = new Set<ImportField>([
  'name', 'fullName', 'firstName', 'lastName', 'nameAndNumber', 'number', 'position', 'goalie', 'letter',
  'jerseySize', 'sockSize', 'pantSize', 'jerseysQty', 'socksQty', 'homeJersey', 'awayJersey', 'homeSocks', 'awaySocks',
]);
const SIZE_FIELDS: readonly SizeField[] = ['jerseySize', 'sockSize', 'pantSize'];

const GOALIE_YES = /^(y|yes|x|✓|✔|true|1|g|gk|goalie|goaltender)$/i;
const GOALIE_NO = /^(n|no|false|0|-|f|d|skater|player)$/i;
const POSITION_GOALIE = /^(g|gk|goalie|goaltender|goalkeeper|netminder)$/i;
const POSITION_MIXED_GOALIE = /^(g\/f|f\/g|g\/d|d\/g|goalie\/skater|skater\/goalie)$/i;
const LETTER_C = /^(c|capt|captain|\(c\))$/i;
const LETTER_A = /^(a|alt|asst|alternate|assistant|\(a\))$/i;
const SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i;

/** "Smith #12", "#12 Smith", "12 - John Smith", "Smith (12)". */
export function splitNameAndNumber(text: string): { name: string; number: string } | null {
  const t = text.trim();
  const front = t.match(/^#?\s*(\d{1,2})\s*[-–,:.)]?\s*(\D.*)$/);
  if (front) return { number: front[1], name: front[2].trim() };
  const back = t.match(/^(.*?\D)\s*[-–,:(]?\s*#?\s*(\d{1,2})\)?$/);
  if (back) return { name: back[1].replace(/[-–,:(#\s]+$/, '').trim(), number: back[2] };
  return null;
}

/** The name markers people type into a name cell: "SMITH (C)", "Chen [A]", "Tremblay (G)". */
export function stripMarkers(raw: string): { name: string; captaincy: '' | 'C' | 'A'; goalie: boolean } {
  let name = raw;
  let captaincy: '' | 'C' | 'A' = '';
  let goalie = false;
  name = name.replace(/[([]\s*(c|capt|captain|a|alt|asst|g|goalie)\s*[)\]]/gi, (_m, w: string) => {
    const k = w.toLowerCase();
    if (k === 'g' || k === 'goalie') goalie = true;
    else if (k === 'c' || k === 'capt' || k === 'captain') captaincy = 'C';
    else captaincy = 'A';
    return ' ';
  });
  return { name: name.replace(/\s+/g, ' ').trim(), captaincy, goalie };
}

/**
 * Which part of a full name goes on the back. "Smith, John" is unambiguous;
 * "John Van Dyke" isn't, and is flagged by the caller for a look.
 */
export function pickName(full: string, format: 'last' | 'full' | 'first'): { value: string; unsure: boolean } {
  const t = full.trim().replace(/\s+/g, ' ');
  if (!t) return { value: '', unsure: false };
  if (format === 'full') return { value: t.replace(/^([^,]+),\s*(.+)$/, '$2 $1'), unsure: false };
  const comma = t.match(/^([^,]+),\s*(.+)$/);
  if (comma) {
    return format === 'last'
      ? { value: comma[1].trim(), unsure: false }
      : { value: comma[2].trim().split(' ')[0], unsure: false };
  }
  const words = t.split(' ');
  if (words.length === 1) return { value: t, unsure: false };
  if (format === 'first') return { value: words[0], unsure: words.length > 2 };
  if (words.length > 2 && SUFFIX.test(words[words.length - 1])) {
    return { value: `${words[words.length - 2]} ${words[words.length - 1]}`, unsure: true };
  }
  return { value: words[words.length - 1], unsure: words.length > 2 };
}

function cleanNumber(raw: string): { value: string; ok: boolean } {
  const t = raw.trim().replace(/^(#|no\.?|num\.?|number)\s*/i, '').trim();
  if (!t) return { value: '', ok: true };
  if (/^\d{1,2}$/.test(t)) return { value: t, ok: true };
  if (/^\d{1,2}\.0+$/.test(t)) return { value: t.replace(/\.0+$/, ''), ok: true };
  return { value: t, ok: false };
}

export function buildImport(a: ImportAnalysis, d: ImportDecisions, ctx: ImportContext): ImportResult {
  const issues: ImportIssue[] = [];
  const add = (i: ImportIssue) => issues.push(i);

  const disputeKeys = new Set(a.disputes.map((x) => `${x.row}:${x.col}`));
  const cell = (r: number, c: number): string => {
    const k = `${r}:${c}`;
    if (k in d.disputes) return (d.disputes[k] ?? '').trim();
    return (a.rows[r]?.[c] ?? '').trim();
  };

  const headerRow = d.headerRow ?? a.headerRow;
  const width = a.rows.reduce((m, r) => Math.max(m, r.length), 0);
  const headerOf = (c: number) => (headerRow >= 0 ? cell(headerRow, c) : '');
  const colName = (c: number) => headerOf(c) || `Column ${String.fromCharCode(65 + (c % 26))}${c >= 26 ? Math.floor(c / 26) : ''}`;

  /* ---------------- which rows are data ---------------- */

  const leftOut: ImportResult['leftOut'] = [];
  const headerSig = headerRow >= 0 ? a.rows[headerRow].map((x) => x.trim().toLowerCase()).join('|') : null;
  const dataRows: number[] = [];
  for (let r = headerRow + 1; r < a.rows.length; r++) {
    const cells = Array.from({ length: width }, (_, c) => cell(r, c));
    if (cells.every((x) => x === '')) continue;
    if (headerSig && cells.map((x) => x.toLowerCase()).join('|') === headerSig) {
      leftOut.push({ row: r, reason: 'The header row again (a new page)', text: cells.filter(Boolean).join(' · ') });
      continue;
    }
    const suggested = a.notPlayerRows.includes(r);
    const out = d.excluded.includes(r) || (suggested && !d.included.includes(r));
    if (out) {
      const text = cells.filter(Boolean).join(' · ');
      leftOut.push({ row: r, reason: suggested ? "Doesn't look like a player" : 'Left out by you', text });
      if (suggested && !d.excluded.includes(r)) {
        add({
          id: `notplayer:${r}`, level: 'confirm', row: r,
          message: `Left out "${text}" — it doesn't look like a player. Confirm, or put it back in.`,
        });
      }
      continue;
    }
    dataRows.push(r);
  }

  /* ---------------- columns ---------------- */

  const sizeColumnsUnknown = a.rules.filter((g) => g.field === 'sizeUnknown').length;
  const onlyJerseys = !ctx.includesSocks && !ctx.includesPantShells;

  const columns: ResolvedColumn[] = [];
  for (let c = 0; c < width; c++) {
    const rules = a.rules[c] ?? { field: 'ignore' as ImportField, confidence: 'low' as const, why: 'nothing to go on' };
    const ai = a.ai ? a.ai[c] ?? null : null;
    const sample = dataRows.map((r) => cell(r, c)).filter(Boolean).slice(0, 4);
    let field: ImportField = 'ignore';
    let status: ResolvedColumn['status'];

    if (c in d.columns) {
      field = d.columns[c];
      status = field === 'ignore' ? 'ignored' : 'chosen';
    } else if (rules.field === 'ignore' && (ai === null || ai.field === 'ignore')) {
      status = 'ignored';
    } else if (rules.field === 'sizeUnknown' && onlyJerseys && sizeColumnsUnknown === 1 && (ai === null || ai.field === 'jerseySize')) {
      // The one size column on a jerseys-only order can only be the jersey size.
      field = 'jerseySize';
      status = 'agreed';
    } else if (ai !== null) {
      // rules.field can be sizeUnknown and ai.field never is, so equal means a real agreement.
      if ((ai.field as ImportField) === rules.field) {
        field = rules.field;
        status = 'agreed';
      } else {
        status = 'open';
      }
    } else if (rules.confidence === 'high' && rules.field !== 'sizeUnknown') {
      field = rules.field;
      status = 'rules';
    } else {
      status = 'open';
    }

    columns.push({ index: c, header: headerOf(c), field: status === 'open' ? 'ignore' : field, rules, ai, status, sample });
  }

  // Two columns can't both be the sock size. Unless Keenan set both himself,
  // both go back to being questions; if he did, that's its own block.
  const byField = new Map<ImportField, ResolvedColumn[]>();
  for (const col of columns) {
    if (col.status === 'open' || col.status === 'ignored' || !SINGLETON.has(col.field)) continue;
    byField.set(col.field, [...(byField.get(col.field) ?? []), col]);
  }
  for (const [field, cols] of byField) {
    if (cols.length < 2) continue;
    const chosen = cols.filter((x) => x.status === 'chosen');
    if (chosen.length >= 2) {
      add({
        id: `twice:${field}`, level: 'block',
        message: `${cols.map((x) => colName(x.index)).join(' and ')} are both set to ${FIELD_LABELS[field]}. Pick one.`,
      });
      for (const x of chosen) x.field = 'ignore';
    }
    for (const x of cols) {
      if (x.status !== 'chosen') {
        x.status = 'open';
        x.field = 'ignore';
      }
    }
  }

  for (const col of columns) {
    if (col.status !== 'open') continue;
    const r = col.rules;
    const opinions = col.ai
      ? r.field === 'sizeUnknown'
        ? `the AI read it as ${FIELD_LABELS[col.ai.field]}; the header doesn't say which garment`
        : `rules: ${FIELD_LABELS[r.field]} (${r.why}); AI: ${FIELD_LABELS[col.ai.field]} (${col.ai.why})`
      : `${FIELD_LABELS[r.field]}? ${r.why}`;
    add({ id: `col:${col.index}`, level: 'block', col: col.index, message: `Which is "${colName(col.index)}"? ${opinions}.` });
  }

  const colOf = (f: ImportField) => columns.find((x) => x.field === f && x.status !== 'open' && x.status !== 'ignored')?.index ?? -1;
  const nameCol = colOf('name');
  const fullCol = colOf('fullName');
  const firstCol = colOf('firstName');
  const lastCol = colOf('lastName');
  const nnCol = colOf('nameAndNumber');
  const numberCol = colOf('number');
  const positionCol = colOf('position');
  const goalieCol = colOf('goalie');
  const letterCol = colOf('letter');
  const sizeCol: Record<SizeField, number> = {
    jerseySize: colOf('jerseySize'), sockSize: colOf('sockSize'), pantSize: colOf('pantSize'),
  };
  const notesCols = columns.filter((x) => x.field === 'notes' && x.status !== 'open' && x.status !== 'ignored').map((x) => x.index);
  const qtyCol = {
    jerseys: colOf('jerseysQty'), socks: colOf('socksQty'), homeJersey: colOf('homeJersey'),
    awayJersey: colOf('awayJersey'), homeSocks: colOf('homeSocks'), awaySocks: colOf('awaySocks'),
  };
  const hasQty = Object.values(qtyCol).some((i) => i >= 0);

  const anyOpen = columns.some((x) => x.status === 'open');
  if (nameCol < 0 && fullCol < 0 && firstCol < 0 && lastCol < 0 && nnCol < 0 && numberCol < 0 && !anyOpen) {
    add({ id: 'no-identity', level: 'block', message: "There's no name or number column. Set which column is which above." });
  }

  /*
   * A garment column for something this order doesn't include: its sizes go
   * nowhere, so they're not translated or asked about — but it's said, since
   * it can mean the order is missing the socks or shells the team expects.
   */
  const ordered = (f: SizeField) =>
    f === 'sockSize' ? ctx.includesSocks : f === 'pantSize' ? ctx.includesPantShells : true;
  for (const f of ['sockSize', 'pantSize'] as const) {
    const c = sizeCol[f];
    if (c < 0 || ordered(f)) continue;
    const filled = dataRows.filter((r) => cell(r, c) !== '').length;
    if (filled === 0) continue;
    const what = f === 'sockSize' ? 'socks' : 'pant shells';
    add({
      id: `not-ordered:${f}`, level: 'confirm', col: c,
      message: `"${colName(c)}" has ${f === 'sockSize' ? 'sock' : 'pant shell'} sizes for ${filled} player${filled === 1 ? '' : 's'}, but this order has no ${what}. Those sizes won't be kept — if they want ${what}, add them to the order first, then import again.`,
    });
  }

  /* ---------------- bare letters, per size column ---------------- */

  const bare: Record<number, 'youth' | 'senior' | undefined> = {};
  const needsBare: number[] = [];
  for (const f of ['jerseySize', 'pantSize'] as const) {
    const c = sizeCol[f];
    if (c < 0 || !ordered(f)) continue;
    const values = dataRows.map((r) => cell(r, c));
    if (!hasBareLetters(values)) continue;
    if (d.bare[c]) {
      bare[c] = d.bare[c];
      continue;
    }
    const deduced = deduceBare(values);
    if (deduced) {
      bare[c] = deduced;
      add({
        id: `bare-deduced:${c}`, level: 'info', col: c,
        message: `"${colName(c)}": plain S/M/L read as adult sizes — this column marks youth sizes with a Y.`,
      });
      continue;
    }
    needsBare.push(c);
    add({
      id: `bare:${c}`, level: 'block', col: c,
      message: `"${colName(c)}" has plain letters (S, M, L…) with nothing saying youth or adult. How should they be read?`,
    });
  }

  /* ---------------- name format ---------------- */

  let needsFormat = false;

  /* ---------------- rows ---------------- */

  const pending = new Map<string, PendingValue>();
  const translated = new Map<string, { field: SizeField; from: string; to: string; count: number }>();
  const rows: ImportedRow[] = [];

  for (const r of dataRows) {
    const rowIssues: Array<ImportIssue & { field?: keyof RowFields }> = [];
    const was: ImportedRow['was'] = {};
    const out: RowFields = {
      name: '', number: '', isGoalie: false, captaincy: '', sockOnly: false, noName: false,
      jerseySize: '', sockSize: '', pantShellSize: '', notes: '',
    };
    const line = `Row ${r + 1}`;

    // Name, and a number if it lives in the same cell.
    let nameText = '';
    let numberText = numberCol >= 0 ? cell(r, numberCol) : '';
    let multiWord = false;
    if (nameCol >= 0) {
      nameText = cell(r, nameCol);
    } else if (fullCol >= 0) {
      nameText = cell(r, fullCol);
      multiWord = nameText.trim().split(/\s+/).length > 1 || nameText.includes(',');
    } else if (firstCol >= 0 || lastCol >= 0) {
      const first = firstCol >= 0 ? cell(r, firstCol) : '';
      const last = lastCol >= 0 ? cell(r, lastCol) : '';
      if (firstCol >= 0 && lastCol >= 0) {
        multiWord = Boolean(first && last);
        nameText = first && last ? `${last}, ${first}` : first || last;
      } else {
        nameText = first || last;
      }
    } else if (nnCol >= 0) {
      const both = cell(r, nnCol);
      const split = both ? splitNameAndNumber(both) : null;
      if (both && !split) {
        rowIssues.push({ id: `nn:${r}`, level: 'block', row: r, field: 'number', message: `${line}: couldn't split "${both}" into a name and a number. Type them in.` });
        nameText = both;
      } else if (split) {
        nameText = split.name;
        if (!numberText) numberText = split.number;
        multiWord = split.name.split(/\s+/).length > 1;
      }
    }

    const marked = stripMarkers(nameText);
    if (marked.name !== nameText.trim()) was.name = nameText;
    nameText = marked.name;

    if (parsesAsNoName(nameText)) {
      out.noName = true;
      nameText = '';
    }

    if (multiWord && nameText) {
      if (!d.nameFormat) {
        needsFormat = true;
        out.name = nameText;
      } else {
        const picked = pickName(nameText, d.nameFormat);
        if (picked.value !== nameText) was.name = nameText;
        out.name = picked.value;
        if (picked.unsure) {
          rowIssues.push({ id: `namepart:${r}`, level: 'confirm', row: r, field: 'name', message: `${line}: "${nameText}" → "${picked.value}" on the back. Right?` });
        }
      }
    } else {
      out.name = nameText;
    }

    // Number.
    if (numberText) {
      const n = cleanNumber(numberText);
      if (!n.ok) {
        rowIssues.push({ id: `num:${r}`, level: 'block', row: r, field: 'number', message: `${line}: number "${numberText}" isn't 0–99. Fix it or clear it.` });
      } else {
        if (n.value !== numberText.trim()) was.number = numberText;
        out.number = n.value;
        if (n.value === '0' && numberCol >= 0 && a.numericCells.includes(`${r}:${numberCol}`)) {
          rowIssues.push({ id: `zero:${r}`, level: 'confirm', row: r, field: 'number', message: `${line}: Excel stored this number as 0. If they wrote 00, change it.` });
        }
      }
    }

    // Goalie.
    let goalieSource = '';
    if (goalieCol >= 0) {
      const g = cell(r, goalieCol);
      if (GOALIE_YES.test(g)) { out.isGoalie = true; goalieSource = g; }
      else if (g && !GOALIE_NO.test(g)) {
        rowIssues.push({ id: `goalie:${r}`, level: 'block', row: r, field: 'isGoalie', message: `${line}: goalie column says "${g}". Goalie or not?` });
      }
    }
    if (positionCol >= 0) {
      const p = cell(r, positionCol);
      if (POSITION_GOALIE.test(p)) { out.isGoalie = true; goalieSource = p; }
      else if (POSITION_MIXED_GOALIE.test(p)) {
        rowIssues.push({ id: `pos:${r}`, level: 'block', row: r, field: 'isGoalie', message: `${line}: position "${p}". Goalie jersey or player jersey?` });
      }
    }
    if (marked.goalie && !out.isGoalie) {
      out.isGoalie = true;
      goalieSource = '(G) in the name';
    }
    if (goalieSource && goalieSource.length > 1 && !GOALIE_YES.test(goalieSource) && !POSITION_GOALIE.test(goalieSource)) {
      was.goalie = goalieSource;
    }

    // Captain letter. A position column's C is centre and never lands here.
    if (letterCol >= 0) {
      const l = cell(r, letterCol);
      if (LETTER_C.test(l)) out.captaincy = 'C';
      else if (LETTER_A.test(l)) out.captaincy = 'A';
      else if (l) rowIssues.push({ id: `letter:${r}`, level: 'block', row: r, field: 'captaincy', message: `${line}: letter column says "${l}". C, A, or none?` });
      if (marked.captaincy && out.captaincy && marked.captaincy !== out.captaincy) {
        rowIssues.push({ id: `letter-mismatch:${r}`, level: 'confirm', row: r, field: 'captaincy', message: `${line}: the name says (${marked.captaincy}) but the letter column says ${out.captaincy}. Using ${out.captaincy}.` });
      }
    } else if (marked.captaincy) {
      out.captaincy = marked.captaincy;
    }

    // Sizes. A goalie marker in the jersey size makes the row a goalie (a
    // goalie cut on a skater isn't a thing), but not the other way round.
    const jerseyRaw = sizeCol.jerseySize >= 0 ? cell(r, sizeCol.jerseySize) : '';
    if (!out.isGoalie && jerseyRaw && parseSize(jerseyRaw).goalie) {
      if (goalieCol >= 0 && cell(r, goalieCol) && GOALIE_NO.test(cell(r, goalieCol))) {
        rowIssues.push({ id: `goalie-size:${r}`, level: 'block', row: r, field: 'isGoalie', message: `${line}: the goalie column says no, but the jersey size is "${jerseyRaw}". Which is it?` });
      } else {
        out.isGoalie = true;
        was.goalie = jerseyRaw;
      }
    }

    for (const f of SIZE_FIELDS) {
      const c = sizeCol[f];
      if (c < 0 || !ordered(f)) continue;
      const raw = cell(r, c);
      if (!raw) continue;
      const target: keyof RowFields = f === 'pantSize' ? 'pantShellSize' : f;
      const res = translateSize(f, raw, { goalieRow: out.isGoalie, bare: bare[c] });
      switch (res.kind) {
        case 'exact':
          out[target] = res.value as never;
          break;
        case 'table': {
          out[target] = res.value as never;
          was[target as 'jerseySize'] = raw;
          const k = `${f}|${raw.toLowerCase()}|${res.value}`;
          const prev = translated.get(k);
          translated.set(k, { field: f, from: raw, to: res.value, count: (prev?.count ?? 0) + 1 });
          break;
        }
        case 'blank':
          if (res.note) was[target as 'jerseySize'] = raw;
          break;
        case 'sockOnly':
          out.sockOnly = true;
          was.jerseySize = raw;
          break;
        case 'needsBare':
          // The column-level question is already listed; nothing goes in until it's answered.
          was[target as 'jerseySize'] = raw;
          break;
        case 'decide': {
          const goalie = out.isGoalie;
          const key = valueKey(f, goalie, raw);
          const decided = d.values[key];
          const options = sizeOptions(f, goalie);
          if (decided !== undefined && (decided === '' || decided.startsWith('=') || options.includes(decided))) {
            out[target] = (decided.startsWith('=') ? raw : decided) as never;
            if (out[target] !== raw) was[target as 'jerseySize'] = raw;
          } else {
            was[target as 'jerseySize'] = raw;
            const p = pending.get(key);
            const aiSuggestion = a.sizeSuggestions[key];
            const suggestion = res.suggestion && options.includes(res.suggestion)
              ? res.suggestion
              : aiSuggestion && options.includes(aiSuggestion) ? aiSuggestion : undefined;
            pending.set(key, {
              key, field: f, goalie, raw, count: (p?.count ?? 0) + 1, reason: res.reason, suggestion,
              suggestedBy: suggestion ? (suggestion === res.suggestion ? 'rule' : 'ai') : undefined,
            });
          }
          break;
        }
      }
    }

    if (out.jerseySize && (GOALIE_JERSEY_SIZES as readonly string[]).includes(out.jerseySize) && !out.isGoalie) {
      out.isGoalie = true;
    }
    if (out.pantShellSize === 'Senior Goalie' && !out.isGoalie) {
      rowIssues.push({ id: `goalie-pants:${r}`, level: 'confirm', row: r, field: 'pantShellSize', message: `${line}: goalie pants on a player who isn't a goalie. Right?` });
    }
    if (out.sockOnly) out.captaincy = '';

    // Notes: one column as it is; several, each with its header.
    const notes = notesCols
      .map((c) => [headerOf(c), cell(r, c)] as const)
      .filter(([, v]) => v)
      .map(([h, v]) => (notesCols.length > 1 && h ? `${h}: ${v}` : v));
    out.notes = notes.join('; ');

    // Typed over on the preview screen. A typed field replaces whatever the
    // file produced for it, and the file's questions about it go away.
    const edit = d.edits[r];
    let kept = rowIssues;
    if (edit) {
      const editedFields = new Set(Object.keys(edit) as Array<keyof RowFields>);
      kept = rowIssues.filter((i) => !(i.field && editedFields.has(i.field)));
      Object.assign(out, edit);
      if (edit.number !== undefined && edit.number !== '' && !/^\d{1,2}$/.test(edit.number)) {
        kept.push({ id: `edit-num:${r}`, level: 'block', row: r, field: 'number', message: `${line}: "${edit.number}" isn't a number from 0 to 99.` });
      }
      for (const f of SIZE_FIELDS) {
        const target: keyof RowFields = f === 'pantSize' ? 'pantShellSize' : f;
        const v = edit[target];
        if (typeof v === 'string' && v !== '' && !sizeOptions(f, out.isGoalie).includes(v)) {
          kept.push({ id: `edit-size:${r}:${f}`, level: 'block', row: r, field: target, message: `${line}: "${v}" isn't one of our ${f === 'jerseySize' ? (out.isGoalie ? 'goalie' : 'player') + ' jersey' : f === 'sockSize' ? 'sock' : 'pant shell'} sizes.` });
        }
      }
      // A typed size settles that cell's pending value.
      for (const f of SIZE_FIELDS) {
        const target: keyof RowFields = f === 'pantSize' ? 'pantShellSize' : f;
        if (edit[target] !== undefined) {
          const c = sizeCol[f];
          if (c >= 0) {
            const key = valueKey(f, out.isGoalie, cell(r, c));
            const p = pending.get(key);
            if (p) {
              if (p.count <= 1) pending.delete(key);
              else pending.set(key, { ...p, count: p.count - 1 });
            }
          }
        }
      }
    }

    if (!out.name && !out.number && !out.sockOnly && !out.noName) {
      kept.push({ id: `blank:${r}`, level: 'confirm', row: r, message: `${line} has no name and no number. Keep it?` });
    }

    for (const i of kept) {
      const { field: _f, ...issue } = i;
      void _f;
      add(issue);
    }

    // Disputed cells (PDF/photo) in a column that's actually used.
    for (let c = 0; c < width; c++) {
      const k = `${r}:${c}`;
      if (!disputeKeys.has(k) || k in d.disputes) continue;
      const col = columns[c];
      if (!col || col.status === 'ignored' || col.field === 'ignore') continue;
      const readings = a.disputes.find((x) => x.row === r && x.col === c)?.readings ?? [];
      add({
        id: `dispute:${k}`, level: 'block', row: r, col: c,
        message: `${line}, ${colName(c)}: the two readings disagree — ${readings.map((x) => `"${x || 'blank'}"`).join(' or ')}. Which is it?`,
      });
    }

    const qty = hasQty
      ? {
          jerseys: numOr(cell(r, qtyCol.jerseys), out.sockOnly ? 0 : 1),
          socks: numOr(cell(r, qtyCol.socks), 1),
          homeJersey: numOr(cell(r, qtyCol.homeJersey), 0),
          awayJersey: numOr(cell(r, qtyCol.awayJersey), 0),
          homeSocks: numOr(cell(r, qtyCol.homeSocks), 0),
          awaySocks: numOr(cell(r, qtyCol.awaySocks), 0),
        }
      : undefined;

    rows.push({ ...out, sourceRow: r, was, qty, hasColumn: { sock: sizeCol.sockSize >= 0, pant: sizeCol.pantSize >= 0 } });
  }

  if (needsFormat) {
    add({ id: 'nameformat', level: 'block', message: 'The names are full names. Which part goes on the back of the jersey?' });
  }

  for (const p of pending.values()) {
    add({
      id: `value:${p.key}`, level: 'block', valueKey: p.key,
      message: `${p.field === 'jerseySize' ? (p.goalie ? 'Goalie jersey' : 'Jersey') : p.field === 'sockSize' ? 'Sock' : 'Pant shell'} size "${p.raw}" (${p.count} ${p.count === 1 ? 'player' : 'players'}): ${/[.?!]$/.test(p.reason) ? p.reason : `${p.reason}.`}`,
    });
  }

  for (const t of translated.values()) {
    add({ id: `tr:${t.field}:${t.from.toLowerCase()}`, level: 'info', message: `"${t.from}" → ${t.to} (${t.count})` });
  }

  /* ---------------- across rows ---------------- */

  const players = rows.filter((x) => !x.sockOnly);
  const byNumber = new Map<string, ImportedRow[]>();
  for (const x of players) {
    if (!x.number) continue;
    byNumber.set(x.number, [...(byNumber.get(x.number) ?? []), x]);
  }
  for (const [n, list] of byNumber) {
    if (list.length < 2) continue;
    add({
      id: `dup:${n}`, level: 'confirm',
      message: `#${n} is on ${list.length} players: ${list.map((x) => x.name || `row ${x.sourceRow + 1}`).join(', ')}. Right?`,
    });
  }

  const slots = rosterSlotCount({ sets: ctx.sets });
  if (slots > 0 && players.length > slots) {
    add({ id: 'count-over', level: 'confirm', message: `${players.length} players in the file; the order has jerseys for ${slots}. Right?` });
  } else if (slots > 0 && players.length < slots) {
    add({ id: 'count-under', level: 'info', message: `${players.length} players in the file; the order has jerseys for ${slots}.` });
  }

  const goaliesOrdered = Math.max(0, ...ctx.sets.map((s) => s.goalieJerseys || 0));
  const goaliesHere = players.filter((x) => x.isGoalie).length;
  if (goaliesHere !== goaliesOrdered && (goaliesHere > 0 || goaliesOrdered > 0) && players.length > 0) {
    add({
      id: 'goalie-count', level: 'confirm',
      message: `${goaliesHere} goalie${goaliesHere === 1 ? '' : 's'} in the file; the order has ${goaliesOrdered} goalie jersey${goaliesOrdered === 1 ? '' : 's'}${ctx.sets.length > 1 ? ' per set' : ''}. Right?`,
    });
  }

  const noNumber = players.filter((x) => !x.number).length;
  if (noNumber > 0 && players.length > 0) {
    add({ id: 'no-numbers', level: 'info', message: `${noNumber} player${noNumber === 1 ? ' has' : 's have'} no number yet.` });
  }

  // Text outside the table ("sizes are adult unless marked", "#9 left the
  // team") is shown and confirmed, never acted on: it's for a person to read.
  if (a.otherText.length) {
    add({ id: 'other-text', level: 'confirm', message: `Also written on the file: ${a.otherText.map((x) => `"${x}"`).join(' · ')}. Nothing was done with it — read it.` });
  }
  if (a.otherSheets.length) {
    add({ id: 'other-sheets', level: 'confirm', message: `This workbook has other sheets that look like a roster too (${a.otherSheets.join(', ')}). Only the sheet shown here was read.` });
  }

  const acknowledged = new Set(d.acknowledged);
  const counts = { block: 0, confirm: 0, info: 0 };
  for (const i of issues) counts[i.level]++;
  const ready =
    rows.length > 0 &&
    counts.block === 0 &&
    issues.filter((i) => i.level === 'confirm').every((i) => acknowledged.has(i.id));

  return {
    columns,
    rows,
    leftOut,
    issues,
    needs: { nameFormat: needsFormat, bare: needsBare, values: [...pending.values()] },
    ready,
    counts,
  };
}

function numOr(v: string, fallback: number): number {
  if (v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/**
 * The accepted rows, as roster entries for a new roster.
 *
 * What each person gets follows the file: a sock size given means socks, a
 * blank sock size in a file that HAS a sock column means none — the team
 * leaving it blank is how "he's not getting socks" usually looks. With no sock
 * column at all, everyone on an order with socks gets them, same as a row
 * added by hand. The tally on the roster shows any mismatch with the order.
 */
export function toRosterEntries(
  result: ImportResult,
  ctx: ImportContext,
  orderId: string,
  rosterId: string,
): RosterEntry[] {
  const homeAway = ctx.orderMode === 'home_away_set';
  const set = (i: number) => ctx.sets[i];
  const jerseysIn = (i: number) => (set(i)?.playerJerseys || 0) + (set(i)?.goalieJerseys || 0) > 0;
  const socksIn = (i: number) => (set(i)?.sockPairs || 0) > 0;

  return result.rows.map((x, i) => {
    const e = blankRosterEntry(orderId, i);
    e.rosterId = rosterId;
    e.playerNameAsPrinted = x.noName ? '' : x.name;
    e.noName = x.noName;
    e.number = x.number;
    e.isGoalie = x.isGoalie && !x.sockOnly;
    e.captaincy = x.sockOnly ? '' : x.captaincy;
    e.sockOnly = x.sockOnly;
    e.jerseySize = x.sockOnly ? '' : x.jerseySize;
    e.sockSize = ctx.includesSocks ? x.sockSize : '';
    e.pantShellSize = ctx.includesPantShells ? x.pantShellSize : '';
    e.notes = x.notes;

    if (x.qty) {
      e.jerseysPerPlayer = x.qty.jerseys;
      e.socksPerPlayer = x.qty.socks;
      e.homeJersey = x.qty.homeJersey;
      e.awayJersey = x.qty.awayJersey;
      e.homeSocks = x.qty.homeSocks;
      e.awaySocks = x.qty.awaySocks;
      return e;
    }

    const getsSocks = ctx.includesSocks && (!x.hasColumn.sock || x.sockSize !== '');
    const getsPants = ctx.includesPantShells && (!x.hasColumn.pant || x.pantShellSize !== '');
    e.jerseysPerPlayer = x.sockOnly ? 0 : 1;
    e.socksPerPlayer = getsSocks ? 1 : 0;
    e.shellsPerPlayer = getsPants ? 1 : 0;
    if (homeAway) {
      e.homeJersey = !x.sockOnly && jerseysIn(0) ? 1 : 0;
      e.awayJersey = !x.sockOnly && jerseysIn(1) ? 1 : 0;
      e.homeSocks = getsSocks && socksIn(0) ? 1 : 0;
      e.awaySocks = getsSocks && socksIn(1) ? 1 : 0;
    }
    return e;
  });
}
