import { CSV_COLUMNS } from './constants';
import type { RosterEntry } from './types';
import { blankRosterEntry } from './order-utils';

/**
 * CSV round-trip for the player roster.
 *
 * The column set must stay compatible with the old Base44 export — that file is
 * what goes to production, so changing its shape breaks a real downstream process.
 *
 * Requirement: export → re-import → identical data.
 */

function escapeCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rosterToCsv(roster: RosterEntry[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = roster.map((r) =>
    [
      r.playerNameAsPrinted,
      r.number,
      r.isGoalie ? 'Yes' : 'No',
      r.sockOnly ? 'Sock Only' : r.jerseySize,
      r.sockSize,
      r.pantShellSize,
      r.jerseysPerPlayer,
      r.socksPerPlayer,
      r.homeJersey,
      r.awayJersey,
      r.homeSocks,
      r.awaySocks,
      r.notes,
    ]
      .map(escapeCell)
      .join(','),
  );
  // \r\n so Excel on Windows behaves.
  return [header, ...rows].join('\r\n') + '\r\n';
}

/** Minimal RFC4180-ish parser — handles quoted cells, embedded commas and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(cell); cell = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += c;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export interface CsvImportResult {
  entries: RosterEntry[];
  /** Rows that couldn't be read. Surfaced to the user — never silently dropped. */
  problems: Array<{ line: number; reason: string; raw: string }>;
}

const ALIASES: Record<string, string> = {
  'player name': 'name',
  'last name': 'name',
  'back last name': 'name',
  name: 'name',
  number: 'number',
  '#': 'number',
  goalie: 'goalie',
  'jersey size': 'jerseySize',
  'sock size': 'sockSize',
  'pant size': 'pantSize',
  'pant shell size': 'pantSize',
  jerseys: 'jerseys',
  socks: 'socks',
  'home jersey': 'homeJersey',
  'away jersey': 'awayJersey',
  'home socks': 'homeSocks',
  'away socks': 'awaySocks',
  notes: 'notes',
};

const truthy = (v: string) => /^(y|yes|true|1|g|goalie)$/i.test(v.trim());
const num = (v: string, fallback = 0) => {
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : fallback;
};

export function csvToRoster(text: string, orderId: string): CsvImportResult {
  const rows = parseCsv(text);
  const problems: CsvImportResult['problems'] = [];
  if (rows.length === 0) return { entries: [], problems };

  const header = rows[0].map((h) => ALIASES[h.trim().toLowerCase()] ?? h.trim().toLowerCase());
  const idx = (key: string) => header.indexOf(key);
  const get = (row: string[], key: string) => {
    const i = idx(key);
    return i === -1 ? '' : (row[i] ?? '').trim();
  };

  if (idx('name') === -1) {
    problems.push({ line: 1, reason: 'No player name column found', raw: rows[0].join(',') });
    return { entries: [], problems };
  }

  const entries: RosterEntry[] = [];
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const name = get(row, 'name');
    const jerseyRaw = get(row, 'jerseySize');
    const sockOnly = /sock\s*only/i.test(jerseyRaw);

    if (!name && !sockOnly) {
      problems.push({ line, reason: 'No player name', raw: row.join(',') });
      return;
    }

    const e = blankRosterEntry(orderId, entries.length);
    e.playerNameAsPrinted = name;
    e.number = get(row, 'number');
    e.isGoalie = truthy(get(row, 'goalie'));
    e.sockOnly = sockOnly;
    e.jerseySize = sockOnly ? '' : jerseyRaw;
    e.sockSize = get(row, 'sockSize');
    e.pantShellSize = get(row, 'pantSize');
    e.jerseysPerPlayer = num(get(row, 'jerseys'), sockOnly ? 0 : 1);
    e.socksPerPlayer = num(get(row, 'socks'), 1);
    e.homeJersey = num(get(row, 'homeJersey'));
    e.awayJersey = num(get(row, 'awayJersey'));
    e.homeSocks = num(get(row, 'homeSocks'));
    e.awaySocks = num(get(row, 'awaySocks'));
    e.notes = get(row, 'notes');
    entries.push(e);
  });

  return { entries, problems };
}
