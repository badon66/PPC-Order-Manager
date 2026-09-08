# Sales — master lists, repeat uploads, duplicate matching

Date: 2026-09-08. Follows the cold-calling module
(`2026-09-06-sales-cold-calling-design.md`) and its follow-ups
(`2026-09-07-sales-follow-ups-design.md`).

## What Keenan asked for

The sales section is not one list per upload. It is one long-lived list per
kind of team — beer/adult league, youth, high school, and whatever comes next —
each with a name. Contacts are added to a list over time by uploading more
spreadsheets into it, and an upload must not create duplicate contacts.

Decisions made with Keenan:

- A list has a **name only**. No description, no per-list settings.
- Contacts are added **only by uploading a sheet into an existing list**. No
  single-contact form.
- Two rows are the **same person when the phone or the email matches**.
- A matching row **fills the existing contact's blanks and changes nothing
  else**. It never overwrites, and it never touches call state.
- The same person in **two different lists is allowed and flagged**, never
  merged and never skipped.
- Approach: grow the existing `CallList` into the master list (not upload
  batches, not a global pool).

## Model

`CallList` stays the unit everything else hangs off (contacts, logs, sessions,
queue, export). Two changes:

- **Creating a list takes a name and nothing else.** `sourceFileName` goes
  away as a list field; it moves onto each upload report.
- **`importReport` becomes `imports: ImportRecord[]`**, newest first, capped
  at the last 10. Each record is one upload:

  ```ts
  interface ImportRecord {
    at: string;                 // instant
    by: string;                 // caller name
    fileName: string;
    added: number;              // new contacts
    merged: Array<{ line: number; contactId: string; filled: string[] }>;
    alsoIn: Array<{ line: number; contactId: string; listId: string; listName: string }>;
    skipped: Array<{ line: number; reason: string; raw: string }>;
    warnings: Array<{ line: number; reason: string }>;
    scriptReplaced: boolean;
  }
  ```

  `healCallList` turns an old `importReport` into a single `ImportRecord`
  (`fileName` from the old `sourceFileName`, `by` from `createdBy`, `at` from
  `createdAt`, `merged`/`alsoIn` empty, `scriptReplaced` true) so the existing
  list carries over with its report intact.

Nothing is stored about matches across lists. "Also in" is derived every time
a page renders, by the same rule the importer uses, so it cannot go stale.

## Matching rules (pure, `src/lib/sales/match.ts`)

- `phoneKey(raw)`: `phoneDigits(raw)` with a leading `1` dropped when the
  result is 11 digits; empty string when fewer than 7 digits remain.
- `emailKey(raw)`: trimmed, lowercased; empty when it has no `@`.
- `identityKeys(c)`: the non-empty set of `phoneKey(phone)`,
  `phoneKey(altPhone)`, `emailKey(email)`.
- `matches(a, b)`: the two key sets intersect. A contact with no keys matches
  nothing.
- `findMatch(row, existing[])`: the first existing contact (by `sortOrder`,
  then `createdAt`) that matches; `null` otherwise.

## Merging rules (pure, `src/lib/sales/merge.ts`)

`fillBlanks(existing, row)` returns `{ patch, filled }`:

- Only the sheet fields on `Contact` (from `orgName` through `notes`, plus
  `raw`) are considered. Call state, `isJerseyManager`, `source`,
  `referredFromContactId`, `sortOrder`, ids and timestamps are never in the
  patch.
- A string field is filled when the existing value is `''` and the row's is
  not. `teams` / `players` are filled when existing is `null`. `priority` is
  filled when existing is `''`. `doNotCall` is never changed by an upload.
- `raw`: every header the existing contact lacks, or has empty, takes the
  row's cell. Existing cells are kept.
- `filled` is the list of human labels of what changed (`Email`, `Website`,
  or the raw header), for the report. An empty `filled` still counts as a
  match in the report ("already up to date").

## The upload (`uploadIntoList(listId, formData)` in `sales/actions.ts`)

Replaces `uploadCallList`. Steps, all decided in one pure function
`planImport(rows, list, existingContacts, otherLists, now)` in
`src/lib/data/sales-logic.ts` so both stores run the same rules:

1. Parse the sheet as today (`contactsFromRows`, `scriptFromRows`). Rows with
   no org and no phone are skipped, as today.
2. Walk the parsed rows in sheet order. For each row:
   - If it matches a contact already in this list → `fillBlanks`; record in
     `merged`.
   - Else if it matches a row accepted earlier in this same upload → fill
     that new contact's blanks; record in `merged` against the new contact.
     (Replaces today's "looks like a duplicate, both kept" warning.)
   - Else → new contact, `sortOrder` continuing after the list's current
     highest; record in `added`.
   - Independently, if the row matches a contact in any other non-deleted
     list → record in `alsoIn` (the row is still added or merged as above).
3. If the sheet has a Script tab with at least one item, the list's script is
   replaced and `scriptReplaced` is true. No Script tab → script untouched.
4. The result is `{ newContacts, patches: ContactPatch[], script | null,
   record: ImportRecord }`. The action writes it through one repository
   call, `repo.applyImport(listId, newContacts, patches, script, record,
   actor)`; the list row (script + imports) is written before contacts, as
   the store's existing write order requires.

`createCallList(name)` becomes the only way to make a list: name required,
trimmed, no contacts, empty script, empty `imports`. Renaming is
`renameCallList(id, name)`.

## Screens

- **`/sales` landing**: a *New list* form (name + Create) replaces the upload
  form. List cards unchanged, plus a rename control (inline, on the list
  page header — not on the card).
- **`/sales/[id]` list page**: an *Add contacts* card (file + Upload) under
  the header. The import panel shows the latest upload's report and a
  collapsed *Earlier uploads* list of the rest (counts only, per upload). The
  first upload into an empty list is the same flow.
- **Contact pages** (read-only page and the calling view's contact panel):
  an *Also in* line under the header listing the other lists the same
  phone/email appears in, linking to that contact's page there. Computed on
  the server page; the calling view receives it precomputed for the current
  contact and its linked contacts.
- Delete list: unchanged.

## Template

Unchanged. The Script tab stays optional in practice: a contacts-only sheet
uploads fine into a list that already has a script. The Read Me line says so.

## Tests (`tests/sales/match.test.ts`, `tests/sales/merge.test.ts`,
additions to `tests/sales/logic.test.ts`)

- `phoneKey`: spaces, dashes, brackets, leading 1, short numbers → `''`.
- `emailKey`: case and whitespace; no `@` → `''`.
- `matches`: phone-only, email-only, alt-phone against phone, no keys.
- `fillBlanks`: fills empty string / null / empty raw cell; never overwrites;
  never touches call state or `doNotCall`; `filled` labels.
- `planImport`: re-uploading the identical sheet adds 0 and merges N with
  empty `filled`; two matching rows in one upload become one contact; a
  match in another list is added here and listed in `alsoIn`; a deleted list
  is ignored; a sheet without a Script tab leaves the script alone; with one,
  replaces it; `sortOrder` continues after existing rows.
- `healCallList`: an old `importReport` becomes one `ImportRecord`.

## Out of scope

Undoing an upload, editing a contact by hand, a per-list description or
settings, and merging contacts across lists. Each was considered and
deliberately left out.
