import { AI_FIELDS, type AiField, type AiGuess, type CellDispute } from './types';

/**
 * Two (or three) AI readings of the same PDF or photo, checked against each
 * other cell by cell.
 *
 * A PDF or a photo can't be read by code, so the AI has to transcribe it — and
 * a transcription can be wrong in a way nothing downstream would notice ("17"
 * read as "12"). So the page is read independently, twice: once row by row,
 * once column by column. Different reading paths make different mistakes, so
 * where the two agree the cell is trusted, and where they don't, the cell
 * becomes a question with both readings shown. When a third reading is taken
 * (the first two didn't even agree on the table's shape), a cell two of the
 * three agree on is taken; anything else is still a question.
 *
 * The readings' own labels for each column are compared the same way: a
 * column only gets an AI opinion when the readings agree on what it is.
 *
 * Pure and tested (tests/roster-import/reconcile.test.ts).
 */

export interface Reading {
  /** Header cells, '' where a column has none. Empty array when the table has no header row. */
  headers: string[];
  rows: string[][];
  /** The reading's label for each column. */
  fields: Array<AiField | null>;
  otherText: string[];
}

export type Reconciled =
  | {
      ok: true;
      /** Header row first when there is one. */
      rows: string[][];
      headerRow: number;
      disputes: CellDispute[];
      ai: Array<AiGuess | null>;
      /** Columns whose header text the readings disagreed on: they're asked about, never assumed. */
      unsureColumns: number[];
      otherText: string[];
      note: string;
    }
  | { ok: false; reason: string };

const key = (s: string) =>
  (s ?? '')
    .normalize('NFKC')
    .replace(/[’`]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const illegible = (s: string) => /\?\?/.test(s ?? '');

function grid(r: Reading): { cells: string[][]; header: boolean } {
  const header = r.headers.some((h) => (h ?? '').trim() !== '');
  const cells = (header ? [r.headers, ...r.rows] : r.rows).map((row) => row.map((c) => (c ?? '').trim()));
  const width = cells.reduce((m, row) => Math.max(m, row.length), 0);
  return { cells: cells.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill('')]), header };
}

/** Turn a column-by-column reading into the same shape as a row-by-row one. */
export function fromColumns(columns: Array<{ header: string; field: AiField | null; cells: string[] }>, otherText: string[]): Reading {
  const height = columns.reduce((m, c) => Math.max(m, c.cells.length), 0);
  // Uneven columns mean a cell was skipped or doubled somewhere: padding would
  // shift every cell below it, so the reading is marked by its height alone and
  // the shape check below catches it.
  const rows = Array.from({ length: height }, (_, r) => columns.map((c) => c.cells[r] ?? ''));
  const uneven = columns.some((c) => c.cells.length !== height);
  return {
    headers: columns.map((c) => c.header ?? ''),
    rows: uneven ? [...rows, ['\u0000uneven']] : rows,
    fields: columns.map((c) => c.field),
    otherText,
  };
}

export function reconcile(readings: Reading[]): Reconciled {
  if (readings.length < 2) return { ok: false, reason: 'The page needs two readings to check against each other.' };

  const grids = readings.map(grid);
  const shape = (i: number) => `${grids[i].cells.length}x${grids[i].cells[0]?.length ?? 0}:${grids[i].header ? 'h' : '-'}`;
  const groups = new Map<string, number[]>();
  readings.forEach((_, i) => groups.set(shape(i), [...(groups.get(shape(i)) ?? []), i]));
  const best = [...groups.values()].sort((a, b) => b.length - a.length)[0];
  if (!best || best.length < 2) {
    return { ok: false, reason: "The readings didn't agree on how many rows and columns the table has." };
  }

  const use = best.map((i) => grids[i]);
  const height = use[0].cells.length;
  const width = use[0].cells[0]?.length ?? 0;
  const hasHeader = use[0].header;
  const rows: string[][] = [];
  const disputes: CellDispute[] = [];
  let majority = 0;

  for (let r = 0; r < height; r++) {
    const row: string[] = [];
    for (let c = 0; c < width; c++) {
      const texts = use.map((g) => g.cells[r][c]);
      const counts = new Map<string, { n: number; text: string }>();
      for (const t of texts) {
        const k = key(t);
        const prev = counts.get(k);
        counts.set(k, { n: (prev?.n ?? 0) + 1, text: prev?.text ?? t });
      }
      const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
      const agreed = top.n === texts.length || (texts.length >= 3 && top.n >= 2);
      if (agreed && !illegible(top.text)) {
        if (top.n < texts.length) majority++;
        row.push(top.text);
      } else {
        row.push(texts[0]);
        // The header row isn't data: a header disagreement makes the column a
        // question instead (see unsureColumns).
        if (!(hasHeader && r === 0)) {
          disputes.push({ row: r, col: c, readings: [...new Set(texts)] });
        }
      }
    }
    rows.push(row);
  }

  const unsureColumns: number[] = [];
  if (hasHeader) {
    for (let c = 0; c < width; c++) {
      const heads = new Set(use.map((g) => key(g.cells[0][c])));
      if (heads.size > 1) unsureColumns.push(c);
    }
  }

  const ai: Array<AiGuess | null> = Array.from({ length: width }, (_, c) => {
    const labels = best.map((i) => readings[i].fields[c] ?? null);
    const first = labels[0];
    if (!first || !(AI_FIELDS as readonly string[]).includes(first)) return null;
    return labels.every((x) => x === first) ? { field: first, why: 'both AI readings agree' } : null;
  });

  const otherText = [...new Set(readings.flatMap((r) => r.otherText).map((s) => s.trim()).filter(Boolean))];
  const n = best.length;
  const dataDisputes = disputes.length;
  const note =
    `Read by AI ${n === 2 ? 'twice' : `${n} times`}, independently` +
    (dataDisputes ? ` — ${dataDisputes} cell${dataDisputes === 1 ? '' : 's'} differed` : ' — every cell matched') +
    (majority ? `; ${majority} settled by two readings out of three` : '');

  return { ok: true, rows, headerRow: hasHeader ? 0 : -1, disputes, ai, unsureColumns, otherText, note };
}
