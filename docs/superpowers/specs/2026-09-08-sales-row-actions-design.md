# Sales — row actions on the contacts table

Date: 2026-09-08. Follows the master-lists change
(`2026-09-08-sales-master-lists-design.md`).

## What Keenan asked for

On the contacts table of a list, double-click a row for a small menu:
**Delete** (with a confirm), **Quick edit** (basic information), and
**Change status** (set the call status quickly). Nothing specific beyond
that — it should work, read clearly, and match the existing theme.

Decisions made with Keenan:

- Change status **records a quick call entry**, not a bare badge.
- Quick edit covers the **person, their numbers and email, and notes**; team
  fields stay as uploaded.
- **Double-click only.** No extra button. The phone card layout keeps its
  single tap to open the contact page; the menu is a desktop-table feature.

## Behaviour

- **Menu.** Double-click anywhere on a table row opens a small menu at the
  pointer: *Change status*, *Quick edit*, *Delete*. Esc, or a click anywhere
  else, closes it. Single click on the org or name still opens the contact
  page. Text selection from a double-click is cleared so the menu doesn't
  fight it.
- **Change status.** A dialog with the same content as the calling view's
  *Call finished* dialog: outcome grid, star rating, the outcome's own prompt
  (callback date, Do Not Call reason, referral, email…), plus a one-line note.
  Saving calls the existing `logCall` with a log whose `startedAt` equals
  `endedAt` (now), `durationSeconds` 0, `callerName` from the stored caller
  name, `sessionId` null, blank script answers. It therefore obeys every
  existing rule: Do Not Call contacts only accept Do Not Call, referred
  creates the linked row, the jersey-manager answer is blank, the queue and
  `nextCallDate` follow `applyCallLog`. History shows it as a call of 0 min.
- **Quick edit.** Fields: contact name, role (pick-list), phone, alt phone,
  email, best time to call (pick-list), priority (A/B/C/blank), notes. Saving
  writes exactly those eight fields and `updatedAt`. `raw` is not touched.
  Changing phone or email changes who this person matches in future uploads;
  that is intended.
- **Delete.** Confirm dialog naming the contact (and org) and how many calls
  go with it. On confirm the contact row and its call logs are removed from
  the store. Sessions keep their rows; a session line whose contact is gone
  already shows "Removed contact". Linked contacts, *Also in* and the queue
  stop listing it because they are all computed from what exists.

## Code

- `src/app/sales/actions.ts`: `quickStatus(listId, contactId, input: CallLogInput)`
  — thin wrapper that forces the zero-duration shape then delegates to
  `logCall`; `quickEditContact(contactId, patch: QuickEditPatch)`; and
  `deleteContact(listId, contactId)`. All `requireRole('staff')` → actor →
  repo → `revalidatePath`.
- `src/lib/data/sales-logic.ts`: `QUICK_EDIT_FIELDS` (the allowlist),
  `quickEditPatch(raw): QuickEditPatch` (trims, validates priority against
  `'' | 'A' | 'B' | 'C'`, drops unknown keys), `quickLogInput(draft input,
  callerName, now)` (the zero-duration shape).
- Repository: `deleteContact(id, actor)` removes the contact and its logs
  (logs first, then the contact — a failure part-way leaves a contact with
  no history, visible and deletable again). `updateContact` already exists
  for quick edit.
- `src/components/sales/row-actions.tsx` (client): wraps each table row's
  double-click; owns the menu and the three dialogs; talks to the actions;
  `router.refresh()` after each success. Reuses `OutcomePanel`,
  `seedForOutcome`, `CallDraft`/`blankDraft` and `inputFromDraft` from the
  calling view, the `StarRating`, and the dialog styling of
  `finish-dialog.tsx` (role=dialog, Esc, backdrop click).
- `src/app/sales/[id]/page.tsx`: rows render through `RowActions`.

## Tests

`tests/sales/row-actions.test.ts`: `quickEditPatch` keeps only the eight
fields, trims, rejects a bad priority; `quickLogInput` yields
`durationSeconds` 0, `startedAt === endedAt`, `sessionId` null, the given
outcome; `validateCallLog` accepts it for a normal contact and blocks it for
a Do Not Call contact with another outcome.

## Out of scope

Bulk selection, undo, editing team fields, a phone-layout menu.
