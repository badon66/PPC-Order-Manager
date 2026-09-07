/**
 * Builds the blank call-list template (and, with --sample <path>, a filled
 * sample used by the import tests). Run through tsx so it can read the TS
 * column map — the sheet and the importer must never disagree on headers:
 *
 *   npm run build:template
 *   node --import tsx scripts/build-call-template.mjs --sample tests/sales/fixtures/sample-list.xlsx --csv tests/sales/fixtures/sample-list.csv
 *
 * --csv writes the sample's Contacts tab as CSV too, so the two fixtures can't drift.
 */
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { CONTACT_COLUMNS } from '../src/lib/sales/columns.ts';
import picklists from '../src/lib/sales/picklists.json' with { type: 'json' };
import defaultScript from '../src/lib/sales/default-script.json' with { type: 'json' };

const SCRIPT_HEADERS = ['Section', 'Kind', 'Text', 'Response', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5', 'Option 6', 'Show When'];
const MAX_ROWS = 2000;

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const samplePath = flag('--sample');
const csvPath = flag('--csv');
const outPath = samplePath ?? 'public/templates/powerplay-call-list-template.xlsx';

const col = (n) => { let s = ''; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(64 + ((n - 1) % 26) + 1) + s; return s; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const wb = new ExcelJS.Workbook();
wb.creator = 'Powerplay Customs';

/* ---- Lists ---- */
const lists = wb.addWorksheet('Lists');
const listKeys = Object.keys(picklists);
lists.columns = listKeys.map((k) => ({ header: k, key: k, width: 28 }));
lists.getRow(1).font = { bold: true };
listKeys.forEach((k, i) => picklists[k].forEach((v, r) => { lists.getCell(r + 2, i + 1).value = v; }));
const listRange = (k) => { const i = listKeys.indexOf(k); const L = col(i); return `Lists!$${L}$2:$${L}$${picklists[k].length + 1}`; };

/* ---- Contacts ---- */
const contacts = wb.addWorksheet('Contacts');
contacts.columns = CONTACT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.key === 'notes' ? 40 : 20 }));
contacts.getRow(1).font = { bold: true };
contacts.views = [{ state: 'frozen', ySplit: 1 }];
for (const [i, c] of CONTACT_COLUMNS.entries()) {
  if (c.key === 'phone' || c.key === 'altPhone' || c.key === 'lastOrderedYear') contacts.getColumn(i + 1).numFmt = '@';
  if (c.picklist) {
    contacts.dataValidations.add(`${col(i)}2:${col(i)}${MAX_ROWS}`, {
      type: 'list', allowBlank: true, showErrorMessage: !c.multi, errorStyle: 'warning',
      formulae: [listRange(c.picklist)],
    });
  }
}

/* ---- Script ---- */
const script = wb.addWorksheet('Script');
script.columns = SCRIPT_HEADERS.map((h) => ({ header: h, key: h, width: h === 'Text' || h === 'Response' ? 60 : 18 }));
script.getRow(1).font = { bold: true };
script.views = [{ state: 'frozen', ySplit: 1 }];
script.dataValidations.add(`A2:A${MAX_ROWS}`, { type: 'list', allowBlank: true, formulae: ['"Opening,Discovery,Objections,Close"'] });
script.dataValidations.add(`B2:B${MAX_ROWS}`, { type: 'list', allowBlank: true, formulae: ['"Read,Reminder,Question,Objection"'] });
for (const item of defaultScript) {
  script.addRow([cap(item.section), cap(item.kind), item.text, item.response, ...Array.from({ length: 6 }, (_, i) => item.options[i] ?? ''), item.showWhen]);
}
script.getColumn(3).alignment = { wrapText: true, vertical: 'top' };
script.getColumn(4).alignment = { wrapText: true, vertical: 'top' };

/* ---- Read Me ---- */
const readme = wb.addWorksheet('Read Me');
readme.columns = [{ header: 'Powerplay Customs — Call List Template', key: 'a', width: 120 }];
readme.getRow(1).font = { bold: true, size: 14 };
[
  '',
  'CONTACTS TAB — one row per person you want to call. Only Org Name or Phone is required; a row with neither is skipped on upload (you are told which line).',
  'Columns with a dropdown pull their choices from the Lists tab. Type something else if you must — it is kept as typed and flagged as a warning, never thrown away.',
  'Age Divisions: pick one from the dropdown or type several separated by commas (U9, U11, U13).',
  'Phone: any format. The app dials it and shows it as (705) 555-0142 when it is a 10-digit number.',
  'Province sets the contact\'s local clock. Use Timezone Override only when the province default is wrong (e.g. Lloydminster on Central).',
  'Ordering Window (month) is used as the default month when you log "Not Now".',
  'Do Not Call = Y means the app never queues that contact and hides the number.',
  'Notes: your research. It shows on the call screen, read-only. Any extra column you add (say "Rink") also shows, under Other info.',
  '',
  'SCRIPT TAB — one row per line of the call, top to bottom within each Section (Opening, Discovery, Objections, Close).',
  'Kind = Read: text to say. Reminder: a tick box. Question: a multiple-choice prompt (fill Option 1–6; leave all blank for a free-text answer). Objection: what they say (Text) and what you say back (Response).',
  'Placeholders in Text/Response: [Name] first name (or "there"), [Full Name], [Org], [City], [Rep] (the caller), [Supplier], or any Contacts column in brackets, e.g. [Rink].',
  'Show When: leave blank to always show. Otherwise a rule like  Org Type = Minor Hockey Association  or  Role != Head Coach  — several values with commas (any of), several rules with semicolons (all of).',
  '',
  'UPLOADING — save this file and upload it on the Sales page. Each upload makes a new list; re-upload to change the script or add people. Results come back out with Export CSV.',
].forEach((line) => readme.addRow([line]));
readme.getColumn(1).alignment = { wrapText: true, vertical: 'top' };

/* ---- Sample rows for the test fixture ---- */
if (samplePath) {
  contacts.getCell(1, CONTACT_COLUMNS.length + 1).value = 'Rink';
  contacts.getCell(1, CONTACT_COLUMNS.length + 1).font = { bold: true };
  const row = (obj, rink = '') => contacts.addRow([...CONTACT_COLUMNS.map((c) => obj[c.key] ?? ''), rink]);
  row({ orgName: 'Ennismore Eagles', orgType: 'Minor Hockey Association', contactName: 'Jamie Ouellette', role: 'Equipment Manager', phone: '(705) 555-0142', email: 'jamie@example.ca', city: 'Ennismore', province: 'ON', league: 'OMHA', ageDivisions: 'U9, U11, U13', teams: 14, players: 210, seasonStartMonth: 'Sep', orderingMonth: 'Jun', currentSupplier: 'XYZ Sports', lastOrderedYear: '2023', colours: 'navy/gold', website: 'https://ennismoreeagles.ca', leadSource: 'Web research', priority: 'A', bestTimeToCall: 'Weekday evening', doNotCall: 'N', notes: 'Board meets Tuesdays' }, 'Ennismore CC');
  row({ orgName: 'Kelowna Kodiaks', orgType: 'Adult Team', contactName: 'Pat Singh', role: 'Captain/Organiser', phone: '250 555 0100', altPhone: '250 555 0101', city: 'Kelowna', province: 'BC', league: 'KAHL Div 2', ageDivisions: 'Adult', teams: 1, players: 18, seasonStartMonth: 'Oct', orderingMonth: 'Sep', colours: 'red/black', social: '@kodiakshockey', leadSource: 'Social', priority: 'B', bestTimeToCall: 'Weekend' }, 'Rutland Arena');
  row({ contactName: 'Nobody Reachable', notes: 'This row has no org and no phone' });
  row({ orgName: 'Ennismore Eagles', orgType: 'Minor Hockey Association', contactName: 'Jamie Ouellette', role: 'Equipment Manager', phone: '705-555-0142', city: 'Ennismore', province: 'ON', notes: 'duplicate of line 2' });
  row({ orgName: 'Prairie Storm', orgType: 'MHA', contactName: 'Chris Roy', role: 'President', phone: '306 555 0199', email: 'chris@example.ca', city: 'Regina', province: 'sk', ageDivisions: 'U7, U9', teams: 12, players: 150, seasonStartMonth: 'Sep', orderingMonth: 'Jul', lastOrderedYear: '2021', leadSource: 'Referral', bestTimeToCall: 'Weekday daytime', doNotCall: 'Y', notes: 'asked not to be called' });
  row({ orgName: 'Lloydminster Lakers', orgType: 'Junior Team', contactName: 'Sam Lee', role: 'Head Coach', phone: '555-0100', city: 'Lloydminster', province: 'AB', timezoneOverride: 'Central', league: 'AJHL', ageDivisions: 'U21', teams: 1, players: 25, seasonStartMonth: 'Aug', orderingMonth: 'Jun', currentSupplier: 'Local Shop', lastOrderedYear: '2024', leadSource: 'Tournament', priority: 'C', bestTimeToCall: 'Weekday daytime', doNotCall: 'N' });
}

mkdirSync(path.dirname(outPath), { recursive: true });
await wb.xlsx.writeFile(outPath);
console.log(`wrote ${outPath}`);
if (samplePath && csvPath) {
  mkdirSync(path.dirname(csvPath), { recursive: true });
  await wb.csv.writeFile(csvPath, { sheetName: 'Contacts' });
  console.log(`wrote ${csvPath}`);
}
