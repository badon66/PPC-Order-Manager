import type { CallListBundle } from '@/lib/data/repository';
import type { CallLog, Contact } from '@/lib/types';
import { escapeCell } from '@/lib/csv';
import { formatTimestamp } from '@/lib/dates';
import { BUSINESS_TIMEZONE, CALL_OUTCOME_META, LAST_REDONE_LABELS, LOOKING_AT_LABELS, SUPPLIER_PRIORITY_LABELS } from '@/lib/constants';
import { blankDiscovery, linkedContacts } from '@/lib/data/sales-logic';
import { CONTACT_COLUMNS, keyForHeader, sheetValue } from './columns';

const RESULT_HEADERS = [
  'Lead Rating', 'Last Outcome', 'Calls', 'Skips', 'Last Called', 'Next Call Date', 'Last Notes', 'Source', 'Jersey Manager', 'Linked Contacts',
  // The five discovery questions, latest known answers (mergeDiscovery keeps them on the contact).
  'Jerseys Last Redone', 'Happy With Last Set', 'Change One Thing', 'Looking At', 'Home', 'Away', 'Top Priority', 'Also Mentioned',
] as const;

/**
 * The list back out as a sheet: the template's 26 columns (current values — a
 * captured email replaces the sheet's), the call state, one column per script
 * question with the latest answer, then any columns the sheet had that we
 * don't know. Re-uploading this works: template headers map, the rest lands
 * in `raw`. UTF-8 BOM so Excel reads accents; CRLF so Excel on Windows behaves.
 */
function discoveryCells(c: Contact): Array<string | number> {
  const d = c.discovery ?? blankDiscovery();
  return [
    d.lastRedone ? LAST_REDONE_LABELS[d.lastRedone] : '',
    d.satisfaction ?? '',
    d.changeOneThing,
    d.lookingAt ? LOOKING_AT_LABELS[d.lookingAt] : '',
    d.lookingAt ? (d.home ? 'Y' : 'N') : '',
    d.lookingAt ? (d.away ? 'Y' : 'N') : '',
    d.primaryPriority ? SUPPLIER_PRIORITY_LABELS[d.primaryPriority] : '',
    d.alsoPriorities.map((p) => SUPPLIER_PRIORITY_LABELS[p]).join('; '),
  ];
}

export function callListToCsv(bundle: CallListBundle): string {
  const { list, contacts, logs } = bundle;
  // Jersey-manager items answer "This person" / "Someone else", so they get a column too.
  const questions = list.script.filter((s) => s.kind === 'question' || s.kind === 'jersey_manager');
  const rawOnly: string[] = [];
  for (const c of contacts) for (const h of Object.keys(c.raw ?? {})) if (!keyForHeader(h) && !rawOnly.includes(h)) rawOnly.push(h);

  const byContact = new Map<string, CallLog[]>();
  for (const g of [...logs].sort((a, b) => b.endedAt.localeCompare(a.endedAt))) {
    byContact.set(g.contactId, [...(byContact.get(g.contactId) ?? []), g]);
  }
  const latestAnswer = (c: Contact, qid: string) => (byContact.get(c.id) ?? []).find((g) => g.answers[qid])?.answers[qid] ?? '';

  const header = [
    ...CONTACT_COLUMNS.map((col) => col.header),
    ...RESULT_HEADERS,
    ...questions.map((q) => `Q: ${q.text}`),
    ...rawOnly,
  ];
  const lines = [header.map(escapeCell).join(',')];
  for (const c of contacts) {
    const latest = (byContact.get(c.id) ?? [])[0];
    const cells = [
      ...CONTACT_COLUMNS.map((col) => sheetValue(c, col.key)),
      c.leadRating ?? '',
      c.lastOutcome ? CALL_OUTCOME_META[c.lastOutcome].label : '',
      c.callCount,
      c.skipCount,
      c.lastCalledAt ? formatTimestamp(c.lastCalledAt, BUSINESS_TIMEZONE) : '',
      c.nextCallDate ?? '',
      latest?.notes ?? '',
      c.source === 'referral' ? 'Referral' : 'Sheet',
      c.isJerseyManager ? 'Y' : 'N',
      linkedContacts(c, contacts).map((x) => x.contactName.trim() || x.role.trim() || '—').join('; '),
      ...discoveryCells(c),
      ...questions.map((q) => latestAnswer(c, q.id)),
      ...rawOnly.map((h) => c.raw?.[h] ?? ''),
    ];
    lines.push(cells.map(escapeCell).join(','));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
