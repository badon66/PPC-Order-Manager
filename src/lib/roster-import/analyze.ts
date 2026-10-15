import { detectHeaderRow, isPowerplayCsv, ourCsvGuesses, ruleGuess, suggestNotPlayers } from './columns';
import { translateSize, valueKey, type SizeField } from './sizes';
import type { ImportContext } from './build';
import { orderIncludesPantShells, orderIncludesSocks } from '@/lib/order-utils';
import type { Order } from '@/lib/types';
import { readByAi, type AiField, type AiGuess, type CellDispute, type ImportAnalysis, type RuleGuess, type SourceKind } from './types';

/**
 * From a grid of cells to an `ImportAnalysis`: which row is the header, what
 * the rules make of each column, which rows look like something other than a
 * player. The AI's opinion is merged in separately (`withAiLabels`), so a file
 * still analyses — on rules alone, and more cautiously — when the AI is off
 * or fails.
 *
 * Pure, and safe to import in the browser: the preview screen re-runs
 * `withHeaderRow` when Keenan says the headings are on a different row.
 *
 * Tested in tests/roster-import/read.test.ts.
 */

const SIZE_FIELDS: readonly SizeField[] = ['jerseySize', 'sockSize', 'pantSize'];
const isSize = (f: string): f is SizeField => (SIZE_FIELDS as readonly string[]).includes(f);

/** Trimmed cells, every row as wide as the widest, trailing empty columns and rows dropped. Row indices never move. */
export function tidyGrid(rows: string[][]): string[][] {
  const cells = rows.map((r) => r.map((c) => (c ?? '').replace(/ /g, ' ').trim()));
  let last = cells.length - 1;
  while (last >= 0 && cells[last].every((c) => c === '')) last--;
  const kept = cells.slice(0, last + 1);
  let width = 0;
  for (const r of kept) {
    for (let c = r.length - 1; c >= 0; c--) {
      if (r[c] !== '') {
        width = Math.max(width, c + 1);
        break;
      }
    }
  }
  return kept.map((r) => Array.from({ length: width }, (_, c) => r[c] ?? ''));
}

function dataRowIndices(rows: string[][], headerRow: number, leaveOut: number[]): number[] {
  const out = new Set(leaveOut);
  const idx: number[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    if (!out.has(r) && rows[r].some((c) => c !== '')) idx.push(r);
  }
  return idx;
}

/** The rules' opinion of every column, given which row holds the headings. */
export function rulesFor(rows: string[][], headerRow: number, notPlayerRows: number[]): RuleGuess[] {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const data = dataRowIndices(rows, headerRow, notPlayerRows);
  return Array.from({ length: width }, (_, c) =>
    ruleGuess(headerRow >= 0 ? rows[headerRow][c] ?? '' : '', data.map((r) => rows[r][c] ?? '')),
  );
}

export interface GridInput {
  fileName: string;
  fileUrl: string;
  kind: SourceKind;
  how: string;
  rows: string[][];
  /** Known already (a PDF reading reports it). Detected from the cells when left out. */
  headerRow?: number;
  numericCells?: string[];
  disputes?: CellDispute[];
  ai?: Array<AiGuess | null> | null;
  aiNote?: string | null;
  otherText?: string[];
  otherSheets?: string[];
  /** Columns whose heading the AI readings disagreed on: never trusted at more than low confidence. */
  unsureColumns?: number[];
}

export function analyzeGrid(input: GridInput): ImportAnalysis {
  const rows = input.rows;
  const headerRow = input.headerRow ?? detectHeaderRow(rows);
  const headerCells = headerRow >= 0 ? rows[headerRow] : [];

  // Our own export comes back as it went out: no AI, no guessing.
  if (!readByAi(input.kind) && headerRow >= 0 && isPowerplayCsv(headerCells)) {
    return {
      version: 1,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
      kind: 'powerplay-csv',
      how: 'A Powerplay roster export — read exactly as it was saved.',
      rows,
      headerRow,
      numericCells: input.numericCells ?? [],
      disputes: [],
      rules: ourCsvGuesses(headerCells),
      ai: null,
      notPlayerRows: [],
      sizeSuggestions: {},
      aiNote: null,
      otherText: input.otherText ?? [],
      otherSheets: input.otherSheets ?? [],
    };
  }

  const notPlayerRows = suggestNotPlayers(rows, headerRow);
  const rules = rulesFor(rows, headerRow, notPlayerRows).map((g, c) =>
    input.unsureColumns?.includes(c)
      ? { ...g, confidence: 'low' as const, why: `${g.why} (the two readings saw different headings here)` }
      : g,
  );

  return {
    version: 1,
    fileName: input.fileName,
    fileUrl: input.fileUrl,
    kind: input.kind,
    how: input.how,
    rows,
    headerRow,
    numericCells: input.numericCells ?? [],
    disputes: input.disputes ?? [],
    rules,
    ai: input.ai ?? null,
    notPlayerRows,
    sizeSuggestions: {},
    aiNote: input.aiNote ?? null,
    otherText: input.otherText ?? [],
    otherSheets: input.otherSheets ?? [],
  };
}

/**
 * The headings are on another row (or there are none: -1). The rules are
 * re-run against the new headings; the AI's labels are per column and stay.
 */
export function withHeaderRow(a: ImportAnalysis, headerRow: number): ImportAnalysis {
  if (headerRow === a.headerRow) return a;
  const h = Math.max(-1, Math.min(headerRow, a.rows.length - 1));
  if (a.kind === 'powerplay-csv') return { ...a, headerRow: h };
  const notPlayerRows = suggestNotPlayers(a.rows, h);
  return { ...a, headerRow: h, notPlayerRows, rules: rulesFor(a.rows, h, notPlayerRows) };
}

/**
 * Size values in the rules' size columns that the fixed table can't
 * translate — "48", "Junior", "Women's M". Sent to the AI for a suggestion,
 * which is only ever shown beside the question, never applied.
 */
export function unusualSizes(a: ImportAnalysis, limit = 40): Array<{ column: number; value: string }> {
  const out: Array<{ column: number; value: string }> = [];
  const seen = new Set<string>();
  const data = dataRowIndices(a.rows, a.headerRow, a.notPlayerRows);
  a.rules.forEach((g, c) => {
    if (!isSize(g.field) && g.field !== 'sizeUnknown') return;
    const field: SizeField = isSize(g.field) ? g.field : 'jerseySize';
    for (const r of data) {
      const raw = a.rows[r][c] ?? '';
      if (!raw) continue;
      const k = `${c}|${raw.toLowerCase()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const t = translateSize(field, raw, { goalieRow: false });
      if (t.kind === 'decide' && !t.suggestion) out.push({ column: c, value: raw });
      if (out.length >= limit) return;
    }
  });
  return out;
}

export interface AiLabels {
  headerRow: number;
  fields: Array<AiField | null>;
  why: string[];
  notPlayerRows: number[];
  suggestions: Array<{ column: number; value: string; suggestion: string }>;
}

/**
 * The AI's column labels, merged in as the second opinion.
 *
 * Where the headings are: the rules' answer stands when they found one (two
 * or more headings they recognise is strong evidence); the AI's is used only
 * when the rules found none — a French or oddly worded header row, say.
 *
 * Rows the AI thinks aren't players are added to the rules' list. Each one
 * left out is shown and confirmed, so adding is the cautious direction.
 */
export function withAiLabels(a: ImportAnalysis, labels: AiLabels): ImportAnalysis {
  let out = a;
  if (a.headerRow < 0 && labels.headerRow >= 0) out = withHeaderRow(a, labels.headerRow);
  const width = out.rows.reduce((m, r) => Math.max(m, r.length), 0);
  const ai: Array<AiGuess | null> = Array.from({ length: width }, (_, c) => {
    const f = labels.fields[c];
    return f ? { field: f, why: labels.why[c] || 'the AI read it so' } : null;
  });
  const notPlayerRows = [...new Set([...out.notPlayerRows, ...labels.notPlayerRows.filter((r) => r > out.headerRow)])].sort((x, y) => x - y);
  return withSuggestions({ ...out, ai, notPlayerRows }, labels.suggestions);
}

/**
 * AI suggestions for size values the table can't translate, keyed the way
 * build.ts looks them up. The garment comes from the AI's label for the
 * column, or the rules' when the AI didn't give one; a column nobody has
 * called a size column gets none. Never applied — only shown beside the
 * question, and only where it's one of the sizes that row could take.
 */
export function withSuggestions(a: ImportAnalysis, suggestions: AiLabels['suggestions']): ImportAnalysis {
  const sizeSuggestions: Record<string, string> = { ...a.sizeSuggestions };
  for (const s of suggestions) {
    const aiField = a.ai?.[s.column]?.field;
    const ruleField = a.rules[s.column]?.field;
    const field = aiField && isSize(aiField) ? aiField : ruleField && isSize(ruleField) ? ruleField : null;
    if (!field) continue;
    // Stored for both kinds of row; build.ts only offers it where it's a valid size.
    sizeSuggestions[valueKey(field, false, s.value)] = s.suggestion;
    sizeSuggestions[valueKey(field, true, s.value)] = s.suggestion;
  }
  return { ...a, sizeSuggestions };
}

/** One line about the order, so the AI knows what the columns could be. No money, no contact details. */
export function aiContextOf(ctx: ImportContext): string {
  const player = Math.max(0, ...ctx.sets.map((s) => s.playerJerseys || 0));
  const goalie = Math.max(0, ...ctx.sets.map((s) => s.goalieJerseys || 0));
  const parts = [
    `${player} player jersey${player === 1 ? '' : 's'} and ${goalie} goalie jersey${goalie === 1 ? '' : 's'}${ctx.sets.length > 1 ? ' per set' : ''}`,
    ctx.includesSocks ? 'socks included' : 'no socks',
    ctx.includesPantShells ? 'pant shells included' : 'no pant shells',
  ];
  return `A hockey team's jersey order: ${parts.join(', ')}.`;
}

/** What the importer needs to know about the order. */
export function importContextOf(o: Pick<Order, 'orderMode' | 'sets' | 'sockType' | 'pantShellType' | 'nameStyle' | 'teamName'>): ImportContext {
  return {
    orderMode: o.orderMode,
    sets: o.sets,
    includesSocks: orderIncludesSocks(o),
    includesPantShells: orderIncludesPantShells(o),
    nameStyle: o.nameStyle,
    teamName: o.teamName,
  };
}

/**
 * The same, for the team's own form: just the counts the checks compare
 * against. Nothing else about the order goes back over the public link.
 */
export function teamImportContext(ctx: ImportContext): ImportContext {
  return {
    ...ctx,
    sets: ctx.sets.map((s) => ({
      label: s.label, playerJerseys: s.playerJerseys || 0, goalieJerseys: s.goalieJerseys || 0,
      sockPairs: s.sockPairs || 0, pantShells: s.pantShells || 0,
      extraJerseys: 0, extraSockPairs: 0, extraPantShells: 0, extrasNotes: '',
    })),
  };
}
