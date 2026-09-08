import type { Contact } from '@/lib/types';
import { CONTACT_COLUMNS, keyForHeader } from './columns';

/**
 * An uploaded row that matches an existing contact fills that contact's
 * blanks and changes nothing else. Only the sheet fields and `raw` are
 * considered: call state, the jersey-manager flag, source, order and ids are
 * never in the patch, and Do Not Call is never changed by an upload.
 * `filled` names what changed, for the import report.
 */
export function fillBlanks(existing: Contact, row: Contact): { patch: Partial<Contact>; filled: string[] } {
  const patch: Partial<Contact> = {};
  const filled: string[] = [];
  for (const col of CONTACT_COLUMNS) {
    if (col.key === 'doNotCall') continue;
    const cur = existing[col.key];
    const next = row[col.key];
    const blank = cur === '' || cur === null || cur === undefined;
    const has = next !== '' && next !== null && next !== undefined;
    if (blank && has) {
      (patch as Record<string, unknown>)[col.key] = next;
      filled.push(col.header);
    }
  }
  const raw = { ...(existing.raw ?? {}) };
  let rawChanged = false;
  for (const [header, cell] of Object.entries(row.raw ?? {})) {
    if (cell && !raw[header]) {
      raw[header] = cell;
      rawChanged = true;
      // Known headers were already reported by their field above; only the extra columns get their own label.
      if (!keyForHeader(header)) filled.push(header);
    }
  }
  if (rawChanged) patch.raw = raw;
  return { patch, filled };
}
