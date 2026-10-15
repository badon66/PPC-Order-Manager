import {
  AI_FIELDS, IMPORT_FIELDS, emptyDecisions,
  type AiGuess, type CellDispute, type ImportAnalysis, type ImportDecisions, type ImportField, type RowFields,
  type RuleGuess, type SourceKind,
} from './types';

/**
 * The preview lives in the browser, and Accept sends it back. The server
 * re-runs `buildImport` on it rather than trusting the rows the screen shows —
 * but first it checks every field is the shape it should be, so a stale tab
 * or a hand-crafted request can't feed it something the builder never
 * expected. Anything malformed is dropped (a decision) or refused (the
 * analysis).
 *
 * Pure and tested (tests/roster-import/validate.test.ts).
 */

const KINDS: readonly SourceKind[] = ['csv', 'xlsx', 'docx', 'html', 'pdf', 'image', 'text', 'powerplay-csv'];
const MAX_ROWS = 600;
const MAX_COLS = 80;
const MAX_CELL = 500;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, max = MAX_CELL): string => (typeof x === 'string' ? x.slice(0, max) : '');
const int = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);
const isField = (x: unknown): x is ImportField => typeof x === 'string' && (IMPORT_FIELDS as readonly string[]).includes(x);
const strings = (x: unknown, max = 50, len = 300): string[] => (Array.isArray(x) ? x.slice(0, max).map((s) => str(s, len)) : []);
const ints = (x: unknown, below: number): number[] => (Array.isArray(x) ? x.filter((n): n is number => int(n) && n >= 0 && n < below) : []);

export function cleanAnalysis(x: unknown): ImportAnalysis | null {
  if (!isObj(x) || x.version !== 1) return null;
  if (!KINDS.includes(x.kind as SourceKind)) return null;
  if (!Array.isArray(x.rows) || x.rows.length > MAX_ROWS) return null;
  const rows = x.rows.map((r) => (Array.isArray(r) ? r.slice(0, MAX_COLS).map((c) => str(c)) : null));
  if (rows.some((r) => r === null)) return null;
  const grid = rows as string[][];
  const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
  if (!int(x.headerRow) || x.headerRow < -1 || x.headerRow >= Math.max(grid.length, 1)) return null;

  const rules: RuleGuess[] = (Array.isArray(x.rules) ? x.rules : []).slice(0, width).map((g) =>
    isObj(g) && isField(g.field)
      ? { field: g.field, confidence: g.confidence === 'high' || g.confidence === 'medium' ? g.confidence : 'low', why: str(g.why, 300) }
      : { field: 'ignore', confidence: 'low', why: '' },
  );
  const ai: Array<AiGuess | null> | null = Array.isArray(x.ai)
    ? x.ai.slice(0, width).map((g) =>
        isObj(g) && typeof g.field === 'string' && (AI_FIELDS as readonly string[]).includes(g.field)
          ? { field: g.field as AiGuess['field'], why: str(g.why, 300) }
          : null,
      )
    : null;
  const disputes: CellDispute[] = (Array.isArray(x.disputes) ? x.disputes : [])
    .filter((d): d is Record<string, unknown> => isObj(d) && int(d.row) && int(d.col))
    .map((d) => ({ row: d.row as number, col: d.col as number, readings: strings(d.readings, 5) }))
    .filter((d) => d.row >= 0 && d.row < grid.length && d.col >= 0 && d.col < width);
  const sizeSuggestions: Record<string, string> = {};
  if (isObj(x.sizeSuggestions)) {
    for (const [k, v] of Object.entries(x.sizeSuggestions).slice(0, 200)) if (typeof v === 'string') sizeSuggestions[k.slice(0, 200)] = v.slice(0, 60);
  }
  const fileUrl = str(x.fileUrl, 300);

  return {
    version: 1,
    fileName: str(x.fileName, 200),
    // Only our own storage: this is shown as a link and kept on the roster.
    fileUrl: /^(artwork\/|\/uploads\/)[A-Za-z0-9._-]+$/.test(fileUrl) ? fileUrl : '',
    kind: x.kind as SourceKind,
    how: str(x.how, 400),
    rows: grid,
    headerRow: x.headerRow,
    numericCells: strings(x.numericCells, 5000, 20),
    disputes,
    rules,
    ai,
    notPlayerRows: ints(x.notPlayerRows, grid.length),
    sizeSuggestions,
    aiNote: typeof x.aiNote === 'string' ? x.aiNote.slice(0, 400) : null,
    otherText: strings(x.otherText, 20),
    otherSheets: strings(x.otherSheets, 20, 100),
  };
}

const ROW_STRING_FIELDS = ['name', 'number', 'jerseySize', 'sockSize', 'pantShellSize', 'notes'] as const;

export function cleanDecisions(x: unknown, a: Pick<ImportAnalysis, 'rows'>): ImportDecisions {
  const d = emptyDecisions();
  if (!isObj(x)) return d;
  const height = a.rows.length;
  const width = a.rows.reduce((m, r) => Math.max(m, r.length), 0);
  const index = (k: string, below: number) => {
    const n = Number(k);
    return Number.isInteger(n) && n >= 0 && n < below ? n : null;
  };

  if (isObj(x.columns)) {
    for (const [k, v] of Object.entries(x.columns)) {
      const c = index(k, width);
      if (c !== null && isField(v)) d.columns[c] = v;
    }
  }
  if (x.nameFormat === 'last' || x.nameFormat === 'full' || x.nameFormat === 'first') d.nameFormat = x.nameFormat;
  if (isObj(x.bare)) {
    for (const [k, v] of Object.entries(x.bare)) {
      const c = index(k, width);
      if (c !== null && (v === 'youth' || v === 'senior')) d.bare[c] = v;
    }
  }
  if (isObj(x.values)) {
    for (const [k, v] of Object.entries(x.values).slice(0, 500)) if (typeof v === 'string') d.values[k.slice(0, 200)] = v.slice(0, 200);
  }
  d.excluded = ints(x.excluded, height);
  d.included = ints(x.included, height);
  if (isObj(x.disputes)) {
    for (const [k, v] of Object.entries(x.disputes).slice(0, 2000)) {
      if (/^\d+:\d+$/.test(k) && typeof v === 'string') d.disputes[k] = v.slice(0, MAX_CELL);
    }
  }
  d.acknowledged = Array.isArray(x.acknowledged)
    ? x.acknowledged.filter((t): t is string => typeof t === 'string').slice(0, 2000).map((t) => t.slice(0, 300))
    : [];
  if (isObj(x.edits)) {
    for (const [k, v] of Object.entries(x.edits)) {
      const r = index(k, height);
      if (r === null || !isObj(v)) continue;
      const e: Partial<RowFields> = {};
      for (const f of ROW_STRING_FIELDS) if (typeof v[f] === 'string') e[f] = (v[f] as string).slice(0, f === 'notes' ? 500 : 100);
      for (const f of ['isGoalie', 'sockOnly', 'noName'] as const) if (typeof v[f] === 'boolean') e[f] = v[f] as boolean;
      if (v.captaincy === '' || v.captaincy === 'C' || v.captaincy === 'A') e.captaincy = v.captaincy;
      d.edits[r] = e;
    }
  }
  if (int(x.headerRow) && x.headerRow >= -1 && x.headerRow < height) d.headerRow = x.headerRow;
  return d;
}
