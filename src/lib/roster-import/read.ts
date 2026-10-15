import readExcelFile from 'read-excel-file/node';
import { strFromU8, unzipSync } from 'fflate';
import { parseCsv } from '@/lib/csv';
import { aiConfigured, labelColumns, readByColumns, readByRows, type AiCall, type AiSource } from './ai';
import { analyzeGrid, tidyGrid, unusualSizes, withAiLabels, withSuggestions } from './analyze';
import { detectHeaderRow, headerGuess, valueProfile } from './columns';
import { reconcile, type Reading } from './reconcile';
import type { ImportAnalysis, SourceKind } from './types';

/**
 * A roster file, as bytes, to an `ImportAnalysis`. SERVER ONLY.
 *
 * What kind of file it is comes from its bytes, not its name: a "roster.xls"
 * a league site exported is often a web page, and a photo is a photo whatever
 * it's called.
 *
 *   spreadsheet, CSV, Word table, web page table
 *                    read by code, cell for cell — nothing is retyped. The AI
 *                    is asked one thing: what each column is.
 *   PDF, photo, a document with no table
 *                    code can't read these, so the AI transcribes them —
 *                    twice, independently (by rows, by columns), and
 *                    reconcile.ts compares the two cell by cell.
 *
 * Every failure is a plain sentence for the screen, never a throw: the caller
 * shows it and the team or Keenan carries on by hand.
 *
 * Tested with a fake AI in tests/roster-import/read.test.ts.
 */

export type ReadResult = { ok: true; analysis: ImportAnalysis } | { ok: false; error: string };

export interface ReadRequest {
  bytes: Uint8Array;
  fileName: string;
  /** Where the original is stored ('' when it isn't). Recorded on the analysis. */
  fileUrl: string;
  /** One line about the order (aiContextOf) — what the columns could be. */
  context: string;
  /** Tests pass a fake; production calls the API. */
  call?: AiCall;
  /** Defaults to whether ANTHROPIC_API_KEY is set. */
  aiOn?: boolean;
  /** Tests pass a fake clock. */
  clock?: () => number;
}

/*
 * The whole read must fit in one function invocation: the routes that call
 * this declare maxDuration 60. Both readings of a PDF run side by side, with
 * nearly all of that; a third reading, or a size suggestion, only happens if
 * the first two came back quickly enough to leave room for it.
 */
const DEADLINE_MS = 56_000;
const FIRST_READ_MS = 48_000;
const LABEL_MS = 30_000;
const EXTRA_MIN_MS = 15_000;
const SAFETY_MS = 2_000;

/** More than this is a league's registration export, not one team's roster. */
const MAX_DATA_ROWS = 400;
/** The API refuses images over 5 MB once encoded. The forms shrink photos before sending; this is the backstop. */
const MAX_IMAGE_BYTES = Math.floor((5 * 1024 * 1024 * 3) / 4) - 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 10;

const AI_OFF_NOTE = "The AI check isn't set up (no ANTHROPIC_API_KEY), so the columns were matched by their headings alone — check each one.";

/* ------------------------------------------------------------------ *
 * What is it?
 * ------------------------------------------------------------------ */

type ImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

export type Sniffed =
  | { kind: 'pdf' }
  | { kind: 'image'; mediaType: ImageType }
  | { kind: 'xlsx' }
  | { kind: 'docx'; xml: string }
  | { kind: 'html'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'unsupported'; message: string };

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, Math.min(to, b.length)));
const ext = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '');

const SAVE_AS = 'Save it as an Excel file (.xlsx), a CSV or a PDF and upload that instead.';

export function sniffFile(bytes: Uint8Array, fileName: string): Sniffed {
  if (bytes.length === 0) return { kind: 'unsupported', message: 'The file is empty.' };
  const e = ext(fileName);

  if (ascii(bytes, 0, 1024).includes('%PDF-')) return { kind: 'pdf' };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'image', mediaType: 'image/png' };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: 'image', mediaType: 'image/jpeg' };
  if (ascii(bytes, 0, 4) === 'GIF8') return { kind: 'image', mediaType: 'image/gif' };
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return { kind: 'image', mediaType: 'image/webp' };
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif|avis)$/.test(brand)) {
      return { kind: 'unsupported', message: "That's an iPhone-style photo (HEIC) that can't be read here. Send a screenshot of it, or the photo as a JPG." };
    }
  }
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a]) || ascii(bytes, 0, 2) === 'BM') {
    return { kind: 'unsupported', message: "That image type can't be read. Send it as a JPG, a PNG or a PDF." };
  }

  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const names: string[] = [];
    let documentXml: Uint8Array | undefined;
    try {
      const files = unzipSync(bytes, {
        filter: (f) => {
          names.push(f.name);
          return f.name === 'word/document.xml';
        },
      });
      documentXml = files['word/document.xml'];
    } catch {
      return { kind: 'unsupported', message: `That file looks damaged — it couldn't be opened. ${SAVE_AS}` };
    }
    if (names.includes('xl/workbook.xml')) return { kind: 'xlsx' };
    if (documentXml) return { kind: 'docx', xml: strFromU8(documentXml) };
    if (names.some((n) => n.startsWith('Index/') && n.endsWith('.iwa')) || e === 'numbers' || e === 'pages') {
      return { kind: 'unsupported', message: 'Apple Numbers and Pages files can\'t be read here. In Numbers, use File → Export To → Excel (or CSV), and upload that.' };
    }
    if (names.includes('content.xml')) {
      return { kind: 'unsupported', message: `OpenOffice / LibreOffice files can't be read here. ${SAVE_AS}` };
    }
    return { kind: 'unsupported', message: `That's a zip file, not a roster. ${SAVE_AS}` };
  }

  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    if (e === 'doc') return { kind: 'unsupported', message: 'That\'s an old Word file (.doc). Save it as .docx or PDF and upload that.' };
    return { kind: 'unsupported', message: `That's an old-style Excel file (.xls). ${SAVE_AS}` };
  }
  if (ascii(bytes, 0, 5) === '{\\rtf') return { kind: 'unsupported', message: 'RTF files can\'t be read here. Save it as .docx or PDF and upload that.' };

  // Binary that isn't anything above. (UTF-16 text is full of zero bytes, but it starts with a byte-order mark.)
  const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
  if (!utf16 && bytes.subarray(0, 4096).includes(0)) return { kind: 'unsupported', message: `That file type can't be read. ${SAVE_AS}` };
  const text = decodeText(bytes);
  if (/<(html|table)[\s>]/i.test(text.slice(0, 4096))) return { kind: 'html', text };
  return { kind: 'text', text };
}

/** UTF-8, UTF-16 with a byte-order mark, or the Windows encoding Excel writes CSVs in. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    // "Bélanger" saved from Excel on Windows isn't UTF-8; read as UTF-8 it would come out "B�langer".
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

function countOutsideQuotes(line: string, d: string): number {
  let n = 0;
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === d && !q) n++;
  }
  return n;
}

/** Comma, semicolon or tab: whichever splits the lines into the same number of cells most consistently. */
export function sniffDelimiter(text: string): ',' | ';' | '\t' | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  if (!lines.length) return null;
  let best: { d: ',' | ';' | '\t'; score: number; mode: number } | null = null;
  for (const d of ['\t', ';', ','] as const) {
    const freq = new Map<number, number>();
    for (const l of lines) {
      const c = countOutsideQuotes(l, d);
      if (c > 0) freq.set(c, (freq.get(c) ?? 0) + 1);
    }
    let mode = 0;
    let modeN = 0;
    for (const [c, n] of freq) if (n > modeN || (n === modeN && c > mode)) { mode = c; modeN = n; }
    if (!mode) continue;
    const score = modeN / lines.length;
    if (!best || score > best.score + 0.05 || (Math.abs(score - best.score) <= 0.05 && mode > best.mode)) best = { d, score, mode };
  }
  return best && best.score >= 0.5 ? best.d : null;
}

/* ------------------------------------------------------------------ *
 * Tables inside documents (Word, web pages)
 * ------------------------------------------------------------------ */

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Each top-level <tag>…</tag> block, nesting respected. */
function blocks(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'gi');
  let depth = 0;
  let start = -1;
  for (let t = re.exec(xml); t; t = re.exec(xml)) {
    if (t[0].startsWith('</')) {
      if (depth === 0) continue; // a stray closing tag
      depth--;
      if (depth === 0) out.push(xml.slice(start, t.index + t[0].length));
    } else {
      if (depth === 0) start = t.index;
      depth++;
    }
  }
  return out;
}

/** Every table in a Word document, as grids. A merged cell keeps its columns so nothing shifts left. */
export function docxTables(xml: string): string[][][] {
  return blocks(xml, 'w:tbl').map((tbl) =>
    blocks(tbl, 'w:tr').map((tr) =>
      blocks(tr, 'w:tc').flatMap((tc) => {
        const text = blocks(tc, 'w:p')
          .map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g)].map((x) => (x[0] === '<w:tab/>' ? ' ' : decodeEntities(x[1]))).join(''))
          .filter((s) => s.trim())
          .join(' ')
          .trim();
        const span = Number(tc.match(/<w:gridSpan\s+w:val="(\d+)"/)?.[1] ?? 1);
        return [text, ...Array(Math.max(0, Math.min(span, 20) - 1)).fill('')];
      }),
    ),
  );
}

/** The document's paragraphs as lines — for a roster typed as lines rather than a table. */
export function docxLines(xml: string): string[] {
  const body = xml.replace(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g, '');
  return blocks(body, 'w:p')
    .map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g)].map((x) => (x[0] === '<w:tab/>' ? '\t' : decodeEntities(x[1]))).join(''))
    .filter((s) => s.trim());
}

export function htmlTables(html: string): string[][][] {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s>][\s\S]*?<\/\1>/gi, '');
  return blocks(clean, 'table').map((t) =>
    blocks(t, 'tr').map((tr) =>
      [...tr.matchAll(/<(td|th)([\s>][\s\S]*?)<\/\1>/gi)].flatMap((m) => {
        const inner = m[2].replace(/^[^>]*>/, '');
        const text = decodeEntities(inner.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
        const span = Number(m[2].match(/colspan\s*=\s*["']?(\d+)/i)?.[1] ?? 1);
        return [text, ...Array(Math.max(0, Math.min(span, 20) - 1)).fill('')];
      }),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Picking the roster out of several tables or sheets
 * ------------------------------------------------------------------ */

function rosterScore(grid: string[][]): { score: number; looksLikeRoster: boolean } {
  const h = detectHeaderRow(grid);
  const recognised = h >= 0 ? grid[h].filter((c) => (headerGuess(c)?.strength ?? 0) >= 0.6).length : 0;
  const dataRows = grid.slice(h + 1).filter((r) => r.some((c) => c !== '')).length;
  return { score: recognised * 100 + Math.min(dataRows, 99), looksLikeRoster: recognised >= 2 && dataRows >= 3 };
}

function pickBest<T extends { grid: string[][] }>(candidates: T[]): { best: T | null; others: T[] } {
  const scored = candidates
    .map((c) => ({ c, ...rosterScore(c.grid) }))
    .filter((x) => x.c.grid.some((r) => r.some((v) => v !== '')));
  if (!scored.length) return { best: null, others: [] };
  const top = scored.reduce((a, b) => (b.score > a.score ? b : a));
  return { best: top.c, others: scored.filter((x) => x !== top && x.looksLikeRoster).map((x) => x.c) };
}

/* ------------------------------------------------------------------ *
 * Excel
 * ------------------------------------------------------------------ */

const pad2 = (n: number) => String(n).padStart(2, '0');

function excelCell(v: unknown): { text: string; numeric: boolean; date: Date | null } {
  if (v === null || v === undefined) return { text: '', numeric: false, date: null };
  if (v instanceof Date) {
    return { text: `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}`, numeric: false, date: v };
  }
  if (typeof v === 'number') return { text: Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12))), numeric: true, date: null };
  if (typeof v === 'boolean') return { text: v ? 'TRUE' : 'FALSE', numeric: false, date: null };
  return { text: String(v).trim(), numeric: false, date: null };
}

interface SheetGrid {
  name: string;
  grid: string[][];
  numericCells: string[];
  dates: Array<{ r: number; c: number; date: Date }>;
}

/**
 * Excel turns a typed "10-12" (a youth size) into the date October 12. In a
 * size column, a date is put back as the month and day it was typed as, and
 * the screen says so. Anywhere else a date stays a date.
 */
function undoDateSizes(s: SheetGrid): number {
  const h = detectHeaderRow(s.grid);
  let fixed = 0;
  const byCol = new Map<number, Array<{ r: number; date: Date }>>();
  for (const d of s.dates) if (d.r > h) byCol.set(d.c, [...(byCol.get(d.c) ?? []), d]);
  for (const [c, dates] of byCol) {
    const header = h >= 0 ? s.grid[h][c] ?? '' : '';
    const g = headerGuess(header)?.field;
    const dateRows = new Set(dates.map((d) => d.r));
    const others = s.grid.slice(h + 1).filter((_, i) => !dateRows.has(i + h + 1)).map((r) => r[c] ?? '');
    const sizeColumn = g === 'jerseySize' || g === 'sockSize' || g === 'pantSize' || g === 'sizeUnknown' || valueProfile(others).size >= 0.5;
    if (!sizeColumn) continue;
    for (const d of dates) {
      s.grid[d.r][c] = `${d.date.getUTCMonth() + 1}-${d.date.getUTCDate()}`;
      fixed++;
    }
  }
  return fixed;
}

async function readWorkbook(bytes: Uint8Array): Promise<{ sheets: SheetGrid[] } | { error: string }> {
  let raw: Array<{ sheet: string; data: unknown[][] }>;
  try {
    raw = (await readExcelFile(Buffer.from(bytes))) as unknown as Array<{ sheet: string; data: unknown[][] }>;
  } catch {
    return { error: `That spreadsheet couldn't be opened. ${SAVE_AS}` };
  }
  const sheets = raw.map(({ sheet, data }) => {
    const numericCells: string[] = [];
    const dates: SheetGrid['dates'] = [];
    const grid = data.map((row, r) =>
      (row ?? []).map((v, c) => {
        const cell = excelCell(v);
        if (cell.numeric) numericCells.push(`${r}:${c}`);
        if (cell.date) dates.push({ r, c, date: cell.date });
        return cell.text;
      }),
    );
    return { name: sheet, grid, numericCells, dates };
  });
  return { sheets };
}

/* ------------------------------------------------------------------ *
 * The two paths
 * ------------------------------------------------------------------ */

function fail(error: string): ReadResult {
  return { ok: false, error };
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Read by code: the cells are what they are. The AI only labels the columns. */
async function fromGrid(
  req: ReadRequest,
  g: { kind: SourceKind; how: string; rows: string[][]; numericCells?: string[]; otherSheets?: string[] },
): Promise<ReadResult> {
  const rows = tidyGrid(g.rows);
  if (!rows.length) return fail("There's nothing in this file.");

  let a = analyzeGrid({
    fileName: req.fileName, fileUrl: req.fileUrl, kind: g.kind, how: g.how, rows,
    numericCells: g.numericCells, otherSheets: g.otherSheets,
  });
  const dataRows = rows.slice(a.headerRow + 1).filter((r) => r.some((c) => c !== '')).length;
  if (dataRows === 0) return fail('The file has headings but nobody listed under them.');
  if (dataRows > MAX_DATA_ROWS) return fail(`This file has ${dataRows} rows — more than one team. Upload just this team's roster.`);
  if (a.kind === 'powerplay-csv') return { ok: true, analysis: a };

  if (!(req.aiOn ?? aiConfigured())) return { ok: true, analysis: { ...a, aiNote: AI_OFF_NOTE } };
  try {
    const labels = await labelColumns(
      { rows: a.rows, context: req.context, unusualSizes: unusualSizes(a) },
      { call: req.call, timeoutMs: LABEL_MS },
    );
    a = withAiLabels(a, labels);
    return { ok: true, analysis: a };
  } catch (e) {
    return {
      ok: true,
      analysis: { ...a, ai: null, aiNote: `The AI check didn't run (${messageOf(e)}), so the columns were matched by their headings alone — check each one.` },
    };
  }
}

/** Read by AI: two independent transcriptions, compared cell by cell. */
async function fromAi(req: ReadRequest, src: AiSource, kind: 'pdf' | 'image' | 'text'): Promise<ReadResult> {
  if (!(req.aiOn ?? aiConfigured())) {
    return fail("Reading a PDF, a photo or a document needs the AI, and it isn't set up yet (ANTHROPIC_API_KEY). A spreadsheet or CSV can still be read.");
  }
  const clock = req.clock ?? Date.now;
  const t0 = clock();
  const left = () => DEADLINE_MS - (clock() - t0);

  const first = await Promise.allSettled([
    readByRows(src, { call: req.call, timeoutMs: FIRST_READ_MS }),
    readByColumns(src, { call: req.call, timeoutMs: FIRST_READ_MS }),
  ]);
  const readings: Reading[] = first.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
  const firstError = first.find((s): s is PromiseRejectedResult => s.status === 'rejected')?.reason;

  if (readings.length === 0) return fail(messageOf(firstError));

  const another = async () => {
    try {
      readings.push(await readByRows(src, { call: req.call, timeoutMs: left() - SAFETY_MS, attempt: 'again' }));
      return true;
    } catch {
      return false;
    }
  };

  // One reading alone is checked against nothing, so it is never used alone.
  if (readings.length === 1 && !(left() >= EXTRA_MIN_MS && (await another()))) {
    return fail(`Only one of the two readings finished (${messageOf(firstError)}), and a single reading isn't checked against anything. Try again.`);
  }

  let rec = reconcile(readings);
  if (!rec.ok && readings.length === 2 && left() >= EXTRA_MIN_MS && (await another())) rec = reconcile(readings);
  if (!rec.ok) {
    return fail(`${rec.reason} Nothing was filled in, because a guess here could put the wrong size on the wrong player. Try again, or send a clearer photo, a PDF or a spreadsheet.`);
  }

  const dataRows = rec.rows.slice(rec.headerRow + 1).filter((r) => r.some((c) => c !== '')).length;
  if (dataRows === 0) return fail("The AI didn't find a roster table in this file.");
  if (dataRows > MAX_DATA_ROWS) return fail(`This file has ${dataRows} rows — more than one team. Upload just this team's roster.`);

  let a = analyzeGrid({
    fileName: req.fileName, fileUrl: req.fileUrl, kind, how: rec.note, rows: rec.rows, headerRow: rec.headerRow,
    disputes: rec.disputes, ai: rec.ai, otherText: rec.otherText, unsureColumns: rec.unsureColumns,
  });

  // A suggestion for each size the table can't translate, if there's time. A nicety: never needed, never applied.
  const odd = unusualSizes(a);
  if (odd.length && left() >= EXTRA_MIN_MS) {
    try {
      const labels = await labelColumns(
        { rows: a.rows, context: req.context, unusualSizes: odd },
        { call: req.call, timeoutMs: Math.min(LABEL_MS, left() - SAFETY_MS) },
      );
      a = withSuggestions(a, labels.suggestions);
    } catch {
      /* the questions stand without suggestions */
    }
  }
  return { ok: true, analysis: a };
}

function pdfPages(bytes: Uint8Array): number {
  // A rough count, for refusing a 40-page handbook. Compressed object streams
  // hide the markers, so 0 just means "don't know".
  const text = Buffer.from(bytes).toString('latin1');
  return (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}

/* ------------------------------------------------------------------ *
 * The entry point
 * ------------------------------------------------------------------ */

export async function readRosterFile(req: ReadRequest): Promise<ReadResult> {
  const f = sniffFile(req.bytes, req.fileName);

  switch (f.kind) {
    case 'unsupported':
      return fail(f.message);

    case 'pdf': {
      if (req.bytes.length > MAX_PDF_BYTES) return fail('That PDF is too large to read. Upload just the roster page.');
      const pages = pdfPages(req.bytes);
      if (pages > MAX_PDF_PAGES) return fail(`That PDF has ${pages} pages. Upload just the page(s) with the roster.`);
      return fromAi(req, { mediaType: 'application/pdf', bytes: req.bytes }, 'pdf');
    }

    case 'image':
      if (req.bytes.length > MAX_IMAGE_BYTES) return fail('That photo is too large to read. Try a screenshot of it instead.');
      return fromAi(req, { mediaType: f.mediaType, bytes: req.bytes }, 'image');

    case 'xlsx': {
      const wb = await readWorkbook(req.bytes);
      if ('error' in wb) return fail(wb.error);
      const { best, others } = pickBest(wb.sheets);
      if (!best) return fail('The spreadsheet is empty.');
      const fixed = undoDateSizes(best);
      const how =
        `Read straight from the spreadsheet${wb.sheets.length > 1 ? ` (the "${best.name}" sheet)` : ''} — every cell exactly as typed.` +
        (fixed ? ` Excel had turned ${fixed} size${fixed === 1 ? '' : 's'} like "10-12" into dates; they're shown as typed.` : '');
      return fromGrid(req, { kind: 'xlsx', how, rows: best.grid, numericCells: best.numericCells, otherSheets: others.map((o) => o.name) });
    }

    case 'docx': {
      const tables = docxTables(f.xml).map((grid, i) => ({ grid, name: `table ${i + 1}` }));
      const { best, others } = pickBest(tables);
      if (best) {
        return fromGrid(req, {
          kind: 'docx',
          how: `Read straight from the table in the Word file${tables.length > 1 ? ` (${best.name} of ${tables.length})` : ''} — every cell exactly as typed.`,
          rows: best.grid,
          otherSheets: others.map((o) => o.name),
        });
      }
      const lines = docxLines(f.xml);
      if (!lines.length) return fail('The Word file is empty.');
      if (lines.every((l) => l.includes('\t'))) {
        return fromGrid(req, { kind: 'docx', how: 'Read straight from the Word file — every cell exactly as typed.', rows: lines.map((l) => l.split('\t')) });
      }
      return fromAi(req, { mediaType: 'text/plain', text: lines.join('\n') }, 'text');
    }

    case 'html': {
      const tables = htmlTables(f.text).map((grid, i) => ({ grid, name: `table ${i + 1}` }));
      const { best, others } = pickBest(tables);
      if (!best) return fail(`That file is a web page with no table in it. ${SAVE_AS}`);
      return fromGrid(req, {
        kind: 'html',
        how: 'Read straight from the table in the file — every cell exactly as written.',
        rows: best.grid,
        otherSheets: others.map((o) => o.name),
      });
    }

    case 'text': {
      // A .csv is a table even when it has one column and so no commas.
      const named = ext(req.fileName);
      const d = sniffDelimiter(f.text) ?? (named === 'csv' ? ',' : named === 'tsv' ? '\t' : null);
      if (d) {
        return fromGrid(req, { kind: 'csv', how: 'Read straight from the file — every cell exactly as written.', rows: parseCsv(f.text, d) });
      }
      const lines = f.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return fail("There's nothing in this file.");
      // One thing per line (a list of names): that's a one-column table.
      if (lines.filter((l) => l.split(/\s+/).length <= 1).length / lines.length >= 0.8) {
        return fromGrid(req, { kind: 'csv', how: 'Read straight from the file — one entry per line.', rows: lines.map((l) => [l]) });
      }
      return fromAi(req, { mediaType: 'text/plain', text: lines.join('\n') }, 'text');
    }
  }
}
