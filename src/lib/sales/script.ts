import type { Contact, ScriptItem } from '@/lib/types';
import { CONTACT_COLUMNS, keyForHeader, normaliseHeader, sheetValue } from './columns';

/*
 * Show When — the rule in the Script tab that makes a line "relevant".
 *
 *   Org Type = Minor Hockey Association
 *   Org Type = Adult Team, Adult League (organiser)      any of
 *   Role != Head Coach; Priority = A                     all of
 *
 * A field name is matched against the Contacts headers, their camelCase keys,
 * and any raw column the sheet had. Values compare trimmed, case-insensitive.
 * A comma-separated field (Age Divisions) is a set: `=` means "contains any".
 * Anything unparseable shows the item — a broken rule must never hide a line.
 */

export interface ShowWhenClause {
  field: string;
  op: '=' | '!=';
  /** lower-cased, trimmed */
  values: string[];
}
export type ParsedShowWhen = { ok: true; clauses: ShowWhenClause[] } | { ok: false; error: string };

const norm = (s: string) => s.trim().toLowerCase();

export function parseShowWhen(rule: string): ParsedShowWhen {
  const text = (rule ?? '').trim();
  if (!text) return { ok: true, clauses: [] };
  const clauses: ShowWhenClause[] = [];
  for (const part of text.split(';')) {
    const m = part.match(/^\s*([^=!]+?)\s*(!=|=)\s*(.+?)\s*$/);
    if (!m) return { ok: false, error: `Can't read "${part.trim()}" — expected "Field = Value" or "Field != Value"` };
    const field = m[1].trim();
    const values = m[3].split(',').map(norm).filter(Boolean);
    if (!field || values.length === 0) return { ok: false, error: `Can't read "${part.trim()}" — field or value is blank` };
    clauses.push({ field, op: m[2] as '=' | '!=', values });
  }
  return { ok: true, clauses };
}

/** The contact's value for a header / key / raw column, or undefined when no such field exists. */
export function contactFieldValue(contact: Contact, field: string): string | undefined {
  const key = keyForHeader(field);
  if (key) return sheetValue(contact, key);
  const camel = CONTACT_COLUMNS.find((c) => c.key.toLowerCase() === field.trim().toLowerCase());
  if (camel) return sheetValue(contact, camel.key);
  const want = normaliseHeader(field);
  for (const [h, v] of Object.entries(contact.raw ?? {})) {
    if (normaliseHeader(h) === want) return v;
  }
  return undefined;
}

export function showWhenMatches(rule: string, contact: Contact): boolean {
  const parsed = parseShowWhen(rule);
  if (!parsed.ok) return true;
  return parsed.clauses.every((cl) => {
    const raw = contactFieldValue(contact, cl.field);
    const have = new Set((raw ?? '').split(',').map(norm).filter(Boolean));
    const hit = cl.values.some((v) => have.has(v));
    return cl.op === '=' ? hit : !hit;
  });
}

export function applicableItems(script: ScriptItem[], contact: Contact): ScriptItem[] {
  return script.filter((item) => showWhenMatches(item.showWhen, contact));
}

const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? '';

/** [Name] [Full Name] [Org] [City] [Rep] [Supplier], then any raw column; unknown stays as typed. */
export function fillPlaceholders(text: string, contact: Contact, callerName: string): string {
  return (text ?? '').replace(/\[([^\]]+)\]/g, (whole, inner: string) => {
    switch (norm(inner)) {
      case 'name': return firstWord(contact.contactName) || 'there';
      case 'full name': return contact.contactName.trim() || 'there';
      case 'org': return contact.orgName;
      case 'city': return contact.city;
      case 'rep': return firstWord(callerName);
      case 'supplier': return contact.currentSupplier.trim() || 'your current supplier';
      default: {
        const v = contactFieldValue(contact, inner);
        return v === undefined ? whole : v;
      }
    }
  });
}
