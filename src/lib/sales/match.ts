import type { CallList, Contact } from '@/lib/types';
import { phoneDigits } from './phone';

/**
 * Who is the same person. Two contacts match when a phone (either number) or
 * the email agrees. Pure; the importer and every "also in" line use it, so
 * nothing about matches is ever stored.
 */

/** Digits only; a leading 1 on an 11-digit number is dropped; under 7 digits is not a number. */
export function phoneKey(raw: string): string {
  let d = phoneDigits(raw ?? '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length >= 7 ? d : '';
}

export function emailKey(raw: string): string {
  const e = (raw ?? '').trim().toLowerCase();
  return e.includes('@') ? e : '';
}

export function identityKeys(c: Contact): Set<string> {
  return new Set([phoneKey(c.phone), phoneKey(c.altPhone), emailKey(c.email)].filter(Boolean));
}

export function matches(a: Contact, b: Contact): boolean {
  const ka = identityKeys(a);
  if (ka.size === 0) return false;
  for (const k of identityKeys(b)) if (ka.has(k)) return true;
  return false;
}

/** The first existing contact (sheet order) the row matches, or null. */
export function findMatch(row: Contact, existing: Contact[]): Contact | null {
  const ordered = [...existing].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  return ordered.find((e) => matches(row, e)) ?? null;
}

export interface AlsoIn { listId: string; listName: string; contactId: string }

/** The other lists this person appears in — the same rule as the importer, computed on every render. */
export function alsoIn(contact: Contact, others: Array<{ list: CallList; contacts: Contact[] }>): AlsoIn[] {
  const out: AlsoIn[] = [];
  for (const o of others) {
    if (o.list.id === contact.listId || o.list.deletedAt) continue;
    const m = findMatch(contact, o.contacts);
    if (m) out.push({ listId: o.list.id, listName: o.list.name, contactId: m.id });
  }
  return out;
}
