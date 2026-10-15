/**
 * Roster import — the shapes passed between reading a file, checking it, and
 * turning it into roster rows.
 *
 * The flow, and who does what:
 *
 *   1. READ     The file becomes a grid of text cells, exactly as written.
 *               CSV and Excel are read by code. A PDF or a photo has to be
 *               read by AI, so it is read TWICE, independently (row by row,
 *               then column by column), and every cell the two readings
 *               disagree on is a dispute for a person to settle.
 *   2. MAP      Each of their columns is matched to one of ours. Two
 *               independent opinions: rules (the header words plus what the
 *               values look like) and AI (or, for a PDF, each AI reading's own
 *               labels). A column is only taken as read when they agree.
 *   3. CHECK    `buildImport` moves the cells across by code — the AI never
 *               retypes a value from a spreadsheet — translates sizes by fixed
 *               table, and lists every issue: things that block Accept until a
 *               person decides, things to confirm, and things it did that are
 *               worth seeing.
 *   4. DECIDE   Keenan settles the open issues on the preview screen.
 *               `ImportDecisions` is everything he chose; the same analysis
 *               plus the same decisions always gives the same roster.
 *   5. ACCEPT   The server runs `buildImport` again with those decisions and
 *               refuses if anything is still open. Only then do rows exist.
 */

export const IMPORT_FIELDS = [
  'name', 'fullName', 'firstName', 'lastName', 'nameAndNumber',
  'number', 'position', 'goalie', 'letter',
  'jerseySize', 'sockSize', 'pantSize', 'sizeUnknown',
  'notes',
  // Only our own CSV has these; nothing else is ever mapped to them.
  'jerseysQty', 'socksQty', 'homeJersey', 'awayJersey', 'homeSocks', 'awaySocks',
  'ignore',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** What the AI may answer with — everything a team's file could hold. */
export const AI_FIELDS = [
  'name', 'fullName', 'firstName', 'lastName', 'nameAndNumber',
  'number', 'position', 'goalie', 'letter',
  'jerseySize', 'sockSize', 'pantSize', 'notes', 'ignore',
] as const satisfies readonly ImportField[];
export type AiField = (typeof AI_FIELDS)[number];

/** Fields a column can be set to on the preview screen. */
export const CHOOSABLE_FIELDS = [
  'name', 'fullName', 'firstName', 'lastName', 'nameAndNumber',
  'number', 'position', 'goalie', 'letter',
  'jerseySize', 'sockSize', 'pantSize', 'notes', 'ignore',
] as const satisfies readonly ImportField[];

export const FIELD_LABELS: Record<ImportField, string> = {
  name: 'Name on the back',
  fullName: 'Full name (first and last)',
  firstName: 'First name',
  lastName: 'Last name',
  nameAndNumber: 'Name and number together',
  number: 'Number',
  position: 'Position (only G matters)',
  goalie: 'Goalie (yes / no)',
  letter: 'Captain letter (C / A)',
  jerseySize: 'Jersey size',
  sockSize: 'Sock size',
  pantSize: 'Pant shell size',
  sizeUnknown: 'A size — which garment?',
  notes: 'Notes',
  jerseysQty: 'Jerseys (quantity)',
  socksQty: 'Socks (quantity)',
  homeJersey: 'Home jersey',
  awayJersey: 'Away jersey',
  homeSocks: 'Home socks',
  awaySocks: 'Away socks',
  ignore: 'Not used',
};

export type Confidence = 'high' | 'medium' | 'low';

export interface RuleGuess {
  field: ImportField;
  confidence: Confidence;
  /** Plain words: "header says Sock Size", "every value is 1–99". */
  why: string;
}

export interface AiGuess {
  field: AiField;
  why: string;
}

/**
 * Where the cells came from. csv, xlsx, docx (a Word table) and html (a web
 * page saved as a spreadsheet) are read by code, cell for cell. pdf, image and
 * text (a document with no table in it) are transcribed by AI, twice.
 */
export type SourceKind = 'csv' | 'xlsx' | 'docx' | 'html' | 'pdf' | 'image' | 'text' | 'powerplay-csv';

/** Read by AI rather than by code — every cell came from two independent transcriptions. */
export function readByAi(kind: SourceKind): boolean {
  return kind === 'pdf' || kind === 'image' || kind === 'text';
}

/** A cell two AI readings disagreed on. `readings` are what each one saw. */
export interface CellDispute {
  row: number;
  col: number;
  readings: string[];
}

export interface ImportAnalysis {
  version: 1;
  fileName: string;
  fileUrl: string;
  kind: SourceKind;
  /** One line for the screen: "Read straight from the spreadsheet", "Read by AI twice — 3 cells differed". */
  how: string;
  /** Every row of the main table, cells as text exactly as written. */
  rows: string[][];
  /** Index of the header row in `rows`; -1 when the file has none. */
  headerRow: number;
  /** Excel cells that were stored as numbers — "00" typed into Excel comes back as 0. */
  numericCells: string[];
  /** PDF/photo only: cells the two readings disagreed on. */
  disputes: CellDispute[];
  /** Per column, by index. */
  rules: RuleGuess[];
  /** Per column, by index; null when there was no AI opinion (no key, or the AI failed). */
  ai: Array<AiGuess | null> | null;
  /** Rows the reader thinks aren't players (a title, "Coach: Dave", a total line). */
  notPlayerRows: number[];
  /** AI suggestions for sizes that can't be translated by rule, keyed by `valueKey`. Never applied on their own. */
  sizeSuggestions: Record<string, string>;
  /** Why the AI isn't involved, when it isn't. */
  aiNote: string | null;
  /** Anything outside the table the reader saw: "Sizes are adult unless marked". Shown, never acted on. */
  otherText: string[];
  /** Other sheets in a workbook that also look like a roster. */
  otherSheets: string[];
}

export type NameFormat = 'last' | 'full' | 'first';

/** Everything a person decided on the preview screen. */
export interface ImportDecisions {
  /** Column index → field, where Keenan picked one. */
  columns: Record<number, ImportField>;
  /** Which part of a full name goes on the back. Needed when the names are full names. */
  nameFormat: NameFormat | null;
  /** Column index → how to read bare letters in it. */
  bare: Record<number, 'youth' | 'senior'>;
  /** `valueKey` → our size, '' to leave it blank, or `=raw` to keep it exactly as they wrote it. */
  values: Record<string, string>;
  /** Source row index → left out / put back in. */
  excluded: number[];
  included: number[];
  /** `${row}:${col}` → the text chosen for a disputed cell. */
  disputes: Record<string, string>;
  /** Issue ids ticked as "seen, it's right". */
  acknowledged: string[];
  /** Source row index → values typed over the result on the preview screen. */
  edits: Record<number, Partial<RowFields>>;
  /** Overrides which row holds the headers. */
  headerRow?: number;
}

export function emptyDecisions(): ImportDecisions {
  return {
    columns: {}, nameFormat: null, bare: {}, values: {}, excluded: [], included: [],
    disputes: {}, acknowledged: [], edits: {},
  };
}

export interface RowFields {
  name: string;
  number: string;
  isGoalie: boolean;
  captaincy: '' | 'C' | 'A';
  sockOnly: boolean;
  noName: boolean;
  jerseySize: string;
  sockSize: string;
  pantShellSize: string;
  notes: string;
}

export interface ImportedRow extends RowFields {
  sourceRow: number;
  /** What the file said, for the cells that were translated: shown beside the result. */
  was: Partial<Record<'name' | 'number' | 'jerseySize' | 'sockSize' | 'pantShellSize' | 'goalie' | 'letter', string>>;
  /** Only our own CSV carries these. */
  qty?: { jerseys: number; socks: number; homeJersey: number; awayJersey: number; homeSocks: number; awaySocks: number };
  /** The garment columns that exist in the file, so a blank sock size can be told from no sock column. */
  hasColumn: { sock: boolean; pant: boolean };
}

export type IssueLevel = 'block' | 'confirm' | 'info';

export interface ImportIssue {
  /** Stable across re-runs, so a tick survives a change elsewhere on the screen. */
  id: string;
  level: IssueLevel;
  message: string;
  row?: number;
  col?: number;
  /** For a size value waiting on a decision. */
  valueKey?: string;
}

export interface ResolvedColumn {
  index: number;
  header: string;
  field: ImportField;
  rules: RuleGuess;
  ai: AiGuess | null;
  /** agreed: rules and AI say the same; chosen: Keenan picked; open: needs a pick; ignored: nobody uses it. */
  status: 'agreed' | 'rules' | 'chosen' | 'open' | 'ignored';
  sample: string[];
}

export interface PendingValue {
  key: string;
  field: 'jerseySize' | 'sockSize' | 'pantSize';
  goalie: boolean;
  raw: string;
  count: number;
  reason: string;
  suggestion?: string;
  /** Where the suggestion came from, so the screen can say. */
  suggestedBy?: 'rule' | 'ai';
}

export interface ImportResult {
  columns: ResolvedColumn[];
  rows: ImportedRow[];
  /** Source rows left out, and why. */
  leftOut: Array<{ row: number; reason: string; text: string }>;
  issues: ImportIssue[];
  needs: {
    nameFormat: boolean;
    /** Columns whose bare letters need a youth/senior call. */
    bare: number[];
    values: PendingValue[];
  };
  /** Nothing blocking, everything to confirm confirmed, at least one row. */
  ready: boolean;
  counts: { block: number; confirm: number; info: number };
}
