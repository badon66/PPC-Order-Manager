/**
 * Spreadsheet → call list. Server-only (read-excel-file/node).
 *
 * Rules (spec §4): a row is skipped only with no org AND no phone; every other
 * problem is a warning and the row is stored as typed. Unknown columns land in
 * `raw`. The upload is one step; the report is persisted on the list.
 */
import readExcelFile from 'read-excel-file/node';
import type { CallList, Contact, ImportReport, ScriptItem, ScriptKind, ScriptSection } from '@/lib/types';
import { SCRIPT_KINDS, SCRIPT_SECTIONS } from '@/lib/types';
import { parseCsv } from '@/lib/csv';
import { newId } from '@/lib/order-utils';
import { blankCallList, blankContact } from '@/lib/data/sales-logic';
import { CONTACT_COLUMNS, keyForHeader, type ContactSheetKey } from './columns';
import { parseShowWhen } from './script';
import { isNorthAmerican, phoneDigits } from './phone';
import picklists from './picklists.json';

export type ImportResult = { ok: true; list: CallList; contacts: Contact[] } | { ok: false; error: string };

type Skipped = ImportReport['skipped'];
type Warnings = ImportReport['warnings'];

/** What a spreadsheet cell becomes. Dates are calendar dates, never instants. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v).trim();
}

const norm = (s: string) => s.trim().toLowerCase();
const isBlankRow = (r: string[]) => r.every((c) => c === '');

function toNumber(s: string): number | null {
  if (s === '') return null;
  const n = Number(s.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const YES = new Set(['y', 'yes', 'true', '1', 'x']);

/* ------------------------------------------------------------------ *
 * Contacts tab
 * ------------------------------------------------------------------ */

export function contactsFromRows(
  rows: string[][],
  listId: string,
  now: string,
  idFor: () => string = newId,
): { contacts: Contact[]; skipped: Skipped; warnings: Warnings } {
  const skipped: Skipped = [];
  const warnings: Warnings = [];
  const contacts: Contact[] = [];

  const headerIdx = rows.findIndex((r) => !isBlankRow(r));
  const headers = headerIdx === -1 ? [] : rows[headerIdx].map((h) => h.trim());
  const keyAt = headers.map((h) => (h ? keyForHeader(h) : null));
  const known = keyAt.filter(Boolean);
  if (headerIdx === -1 || (!known.includes('orgName') && !known.includes('phone'))) {
    skipped.push({ line: headerIdx === -1 ? 1 : headerIdx + 1, reason: 'No recognisable header row — need at least "Org Name" or "Phone"', raw: headers.join(', ') });
    return { contacts, skipped, warnings };
  }

  const seen = new Map<string, number>();
  let sortOrder = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const line = i + 1;
    const cells = rows[i].map((c) => c ?? '');
    if (isBlankRow(cells)) continue;

    const raw: Record<string, string> = {};
    headers.forEach((h, j) => { if (h) raw[h] = cells[j] ?? ''; });

    const get = (key: ContactSheetKey) => { const j = keyAt.indexOf(key); return j === -1 ? '' : (cells[j] ?? '').trim(); };

    if (!get('orgName') && !get('phone')) {
      skipped.push({ line, reason: 'Row has no org and no phone — nothing to call', raw: cells.filter(Boolean).join(' | ') });
      continue;
    }

    sortOrder += 1;
    const c = blankContact(listId, sortOrder, now);
    c.id = idFor();
    c.raw = raw;

    for (const col of CONTACT_COLUMNS) {
      const v = get(col.key);
      switch (col.kind) {
        case 'number': (c as unknown as Record<string, unknown>)[col.key] = toNumber(v); break;
        case 'yesNo': c.doNotCall = YES.has(norm(v)); break;
        case 'priority': {
          const p = v.toUpperCase();
          c.priority = p === 'A' || p === 'B' || p === 'C' ? p : '';
          if (v && !c.priority) warnings.push({ line, reason: `Priority "${v}" isn't A, B or C — left blank` });
          break;
        }
        case 'province': c.province = v.toUpperCase(); break;
        default: (c as unknown as Record<string, unknown>)[col.key] = v;
      }
      if (col.picklist && v) {
        const allowed = new Set((picklists[col.picklist] as string[]).map(norm));
        const values = col.multi ? v.split(',').map(norm).filter(Boolean) : [norm(v)];
        const bad = values.filter((x) => !allowed.has(x));
        if (bad.length && col.kind !== 'priority') {
          warnings.push({ line, reason: `${col.header} "${v}" isn't on the list — kept as typed` });
        }
      }
    }

    if (c.phone && !isNorthAmerican(c.phone)) warnings.push({ line, reason: `Phone "${c.phone}" isn't a 10-digit number — kept as typed` });
    if (c.altPhone && !isNorthAmerican(c.altPhone)) warnings.push({ line, reason: `Alt Phone "${c.altPhone}" isn't a 10-digit number — kept as typed` });
    if (c.doNotCall) warnings.push({ line, reason: 'Do Not Call is set — this contact will never be queued' });

    const dupKey = `${norm(c.orgName)}|${phoneDigits(c.phone)}`;
    if (phoneDigits(c.phone)) {
      const first = seen.get(dupKey);
      if (first) warnings.push({ line, reason: `Looks like a duplicate of line ${first} (same org and phone) — both kept` });
      else seen.set(dupKey, line);
    }

    contacts.push(c);
  }

  return { contacts, skipped, warnings };
}

/* ------------------------------------------------------------------ *
 * Script tab
 * ------------------------------------------------------------------ */

const SCRIPT_KEYS = ['section', 'kind', 'text', 'response', 'option 1', 'option 2', 'option 3', 'option 4', 'option 5', 'option 6', 'show when'] as const;

export function scriptFromRows(rows: string[][]): { items: ScriptItem[]; skipped: Skipped; warnings: Warnings } {
  const items: ScriptItem[] = [];
  const skipped: Skipped = [];
  const warnings: Warnings = [];
  const headerIdx = rows.findIndex((r) => !isBlankRow(r));
  if (headerIdx === -1) return { items, skipped, warnings };
  const header = rows[headerIdx].map(norm);
  const at = (key: (typeof SCRIPT_KEYS)[number], cells: string[]) => { const j = header.indexOf(key); return j === -1 ? '' : (cells[j] ?? '').trim(); };

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const line = i + 1;
    const cells = rows[i].map((c) => c ?? '');
    if (isBlankRow(cells)) continue;
    const section = norm(at('section', cells)) as ScriptSection;
    const kind = norm(at('kind', cells)) as ScriptKind;
    const text = at('text', cells);
    const raw = cells.filter(Boolean).join(' | ');
    if (!(SCRIPT_SECTIONS as readonly string[]).includes(section)) { skipped.push({ line, reason: `Script: Section "${at('section', cells)}" isn't Opening, Discovery, Objections or Close`, raw }); continue; }
    if (!(SCRIPT_KINDS as readonly string[]).includes(kind)) { skipped.push({ line, reason: `Script: Kind "${at('kind', cells)}" isn't Read, Reminder, Question or Objection`, raw }); continue; }
    if (!text) { skipped.push({ line, reason: 'Script: Text is blank', raw }); continue; }
    const showWhen = at('show when', cells);
    const parsed = parseShowWhen(showWhen);
    if (!parsed.ok) warnings.push({ line, reason: `Script: Show When "${showWhen}" — ${parsed.error}. The line will always show.` });
    const options = (['option 1', 'option 2', 'option 3', 'option 4', 'option 5', 'option 6'] as const).map((k) => at(k, cells)).filter(Boolean);
    items.push({ id: `s${items.length + 1}`, section, kind, text, response: at('response', cells), options, showWhen });
  }
  return { items, skipped, warnings };
}

/* ------------------------------------------------------------------ *
 * File → rows
 * ------------------------------------------------------------------ */

async function readSheets(fileName: string, bytes: Uint8Array): Promise<{ contacts: string[][]; script: string[][] | null } | { error: string }> {
  if (bytes.byteLength === 0) return { error: 'The file is empty' };
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'csv') {
    const text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
    return { contacts: parseCsv(text), script: null };
  }
  if (ext !== 'xlsx') return { error: 'Upload an .xlsx or .csv file' };
  let sheets: Array<{ sheet: string; data: unknown[][] }>;
  try {
    sheets = await readExcelFile(Buffer.from(bytes));
  } catch {
    return { error: "Couldn't read that as an Excel file" };
  }
  if (!sheets.length) return { error: 'The workbook has no sheets' };
  const byName = (n: string) => sheets.find((s) => norm(s.sheet) === n);
  const contacts = byName('contacts') ?? sheets[0];
  const script = byName('script');
  const toText = (data: unknown[][]) => data.map((r) => r.map(cellText));
  return { contacts: toText(contacts.data), script: script ? toText(script.data) : null };
}

export async function parseCallListFile(opts: {
  fileName: string; bytes: Uint8Array; listId: string; listName: string; createdBy: string; now: string;
}): Promise<ImportResult> {
  const read = await readSheets(opts.fileName, opts.bytes);
  if ('error' in read) return { ok: false, error: read.error };

  const c = contactsFromRows(read.contacts, opts.listId, opts.now);
  const s = read.script ? scriptFromRows(read.script) : { items: [], skipped: [], warnings: [] };
  if (c.contacts.length === 0) {
    return { ok: false, error: c.skipped[0]?.reason ?? 'No contacts found in the sheet' };
  }

  const list = blankCallList(opts.listId, opts.listName.trim() || opts.fileName.replace(/\.[^.]+$/, ''), opts.fileName, opts.createdBy, opts.now);
  list.script = s.items;
  list.importReport = {
    imported: c.contacts.length,
    skipped: [...c.skipped, ...s.skipped],
    warnings: [...c.warnings, ...s.warnings].sort((a, b) => a.line - b.line),
  };
  return { ok: true, list, contacts: c.contacts };
}
