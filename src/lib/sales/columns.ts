import type { Contact } from '@/lib/types';
import picklists from './picklists.json';

/**
 * The Contacts tab, column by column. This is the single description of the
 * sheet: the importer maps headers with it, the exporter writes them in this
 * order, the template builder reads it (via the JSON mirror it generates from
 * the same list), and Show When rules resolve field names through it.
 */
export type ContactSheetKey =
  | 'orgName' | 'orgType' | 'contactName' | 'role' | 'phone' | 'altPhone' | 'email'
  | 'city' | 'province' | 'timezoneOverride' | 'league' | 'ageDivisions' | 'teams'
  | 'players' | 'seasonStartMonth' | 'orderingMonth' | 'currentSupplier'
  | 'lastOrderedYear' | 'colours' | 'website' | 'social' | 'leadSource' | 'priority'
  | 'bestTimeToCall' | 'doNotCall' | 'notes';

export type ColumnKind = 'text' | 'number' | 'yesNo' | 'priority' | 'province';

export interface ContactColumn {
  header: string;
  key: ContactSheetKey;
  aliases: string[];
  kind: ColumnKind;
  /** Which pick-list constrains the value (warning when not on it). */
  picklist?: keyof typeof picklists;
  /** Comma-separated multi-value (Age Divisions). */
  multi?: boolean;
}

export const CONTACT_COLUMNS: readonly ContactColumn[] = [
  { header: 'Org Name', key: 'orgName', kind: 'text', aliases: ['org', 'organization', 'organisation', 'team', 'team name', 'association', 'club'] },
  { header: 'Org Type', key: 'orgType', kind: 'text', picklist: 'orgType', aliases: ['type', 'organization type', 'organisation type'] },
  { header: 'Contact Name', key: 'contactName', kind: 'text', aliases: ['name', 'contact', 'full name', 'person'] },
  { header: 'Role', key: 'role', kind: 'text', picklist: 'role', aliases: ['title', 'position'] },
  { header: 'Phone', key: 'phone', kind: 'text', aliases: ['phone number', 'cell', 'mobile', 'telephone', 'tel'] },
  { header: 'Alt Phone', key: 'altPhone', kind: 'text', aliases: ['alternate phone', 'phone 2', 'second phone', 'other phone'] },
  { header: 'Email', key: 'email', kind: 'text', aliases: ['e-mail', 'email address'] },
  { header: 'City', key: 'city', kind: 'text', aliases: ['town'] },
  { header: 'Province', key: 'province', kind: 'province', picklist: 'province', aliases: ['prov', 'province/state', 'state'] },
  { header: 'Timezone Override', key: 'timezoneOverride', kind: 'text', picklist: 'timezoneOverride', aliases: ['timezone', 'time zone'] },
  { header: 'League / Level', key: 'league', kind: 'text', aliases: ['league', 'level', 'league level'] },
  { header: 'Age Divisions', key: 'ageDivisions', kind: 'text', picklist: 'ageDivisions', multi: true, aliases: ['divisions', 'age groups', 'ages'] },
  { header: 'Teams (#)', key: 'teams', kind: 'number', aliases: ['teams', 'number of teams', 'team count'] },
  { header: 'Players (approx)', key: 'players', kind: 'number', aliases: ['players', 'number of players', 'player count'] },
  { header: 'Season Start (month)', key: 'seasonStartMonth', kind: 'text', picklist: 'month', aliases: ['season start'] },
  { header: 'Ordering Window (month)', key: 'orderingMonth', kind: 'text', picklist: 'month', aliases: ['ordering window', 'orders in', 'order month', 'ordering month'] },
  { header: 'Current Supplier', key: 'currentSupplier', kind: 'text', aliases: ['supplier', 'vendor'] },
  { header: 'Last Ordered (year)', key: 'lastOrderedYear', kind: 'text', aliases: ['last ordered', 'last order year'] },
  { header: 'Colours', key: 'colours', kind: 'text', aliases: ['colors', 'team colours', 'team colors'] },
  { header: 'Website', key: 'website', kind: 'text', aliases: ['web', 'url', 'site'] },
  { header: 'Social', key: 'social', kind: 'text', aliases: ['social media', 'instagram', 'facebook'] },
  { header: 'Lead Source', key: 'leadSource', kind: 'text', picklist: 'leadSource', aliases: ['source'] },
  { header: 'Priority', key: 'priority', kind: 'priority', picklist: 'priority', aliases: ['priority (a/b/c)', 'priority abc', 'tier', 'rank'] },
  { header: 'Best Time to Call', key: 'bestTimeToCall', kind: 'text', picklist: 'bestTimeToCall', aliases: ['best time', 'call time', 'when to call'] },
  { header: 'Do Not Call', key: 'doNotCall', kind: 'yesNo', picklist: 'yesNo', aliases: ['dnc', 'do not call', 'no call'] },
  { header: 'Notes', key: 'notes', kind: 'text', aliases: ['note', 'comments', 'research'] },
];

/** Lower-case, punctuation stripped, whitespace collapsed. 'Teams (#)' → 'teams'. */
export function normaliseHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADER_TO_KEY: Record<string, ContactSheetKey> = {};
for (const col of CONTACT_COLUMNS) {
  HEADER_TO_KEY[normaliseHeader(col.header)] = col.key;
  for (const a of col.aliases) HEADER_TO_KEY[normaliseHeader(a)] ??= col.key;
}

export function keyForHeader(header: string): ContactSheetKey | null {
  return HEADER_TO_KEY[normaliseHeader(header)] ?? null;
}

export function headerForKey(key: ContactSheetKey): string {
  return CONTACT_COLUMNS.find((c) => c.key === key)!.header;
}

/** The sheet-facing string for a contact field (numbers and booleans rendered). */
export function sheetValue(contact: Contact, key: ContactSheetKey): string {
  const v = contact[key];
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Y' : 'N';
  return String(v);
}
