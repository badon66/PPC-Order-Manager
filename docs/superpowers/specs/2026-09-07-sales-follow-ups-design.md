# Sales — follow-up changes: design

Date: 2026-09-07 · Owner: Keenan Huber · Status: approved · Extends
`2026-09-06-sales-cold-calling-design.md` (everything not mentioned here is
unchanged).

## 1. What changes and why

Five changes Keenan asked for after using the first release:

1. **Ultra-wide layout** on the Sales pages only — he calls from an ultra-wide
   monitor and the 72rem container wastes most of it.
2. **"Call finished" dialog** — the outcome survey moves off the page into a
   popup opened at the end of the call, so the page during the call is contact,
   script and notes only.
3. **Jersey manager question** — the "who looks after jerseys" question becomes a
   first-class script kind that flags which contact handles the jerseys, can
   point at another known contact at the same team, or add a new one. Contacts
   at the same team are **linked and listed on each other**, never merged: each
   stays its own row and its own place in the queue.
4. **Contact page** — clicking a contact anywhere outside the calling view opens a
   read-only page for that person, not a calling session.
5. **Session log** — which calling session touched which contacts, with
   timestamps, stored as one small row per session and one id per call.

Decisions: width applies to Sales only; the manager mechanic is "flag and
link", not "merge"; the existing **Referred** outcome keeps creating a new
linked row (it already matches the model) and does not set the manager flag.

## 2. Data model changes

```ts
// types.ts
export const SCRIPT_KINDS = ['read', 'reminder', 'question', 'objection', 'jersey_manager'] as const;

export interface Contact {
  …existing…
  /** Set by the Jersey manager question. At most one true per linked team. */
  isJerseyManager: boolean;
}

export interface JerseyManagerAnswer {
  /** '' = not asked / not answered. */
  answer: '' | 'self' | 'other';
  /** 'other' → an already-known linked contact… */
  existingContactId: string;
  /** …or someone new. Blank when existingContactId is set. */
  person: { name: string; role: string; phone: string; email: string; note: string };
}

export interface CallLog {
  …existing…
  sessionId: string | null;
  jerseyManager: JerseyManagerAnswer;
}

export interface CallSession {
  id: string;
  listId: string;
  callerName: string;
  startedAt: string;            // ISO instant
  endedAt: string | null;       // null while open
  createdAt: string;
  updatedAt: string;
}
```

Heal: `isJerseyManager ??= false`; `sessionId ??= null`; `jerseyManager ??=
{ answer: '', existingContactId: '', person: {…blank} }`.

**Linked contacts are derived, not stored:** two contacts are linked when they
are in the same list and `orgKey(a.orgName) === orgKey(b.orgName)`, where
`orgKey` = trimmed, lower-cased, whitespace-collapsed. A contact created from a
call copies its source's `orgName`, so it links automatically.

`CallListBundle` gains `sessions: CallSession[]` (newest first).

Migration `0005_call_sessions.sql`: table `call_sessions (id uuid pk, list_id
uuid fk cascade, data jsonb, started_at timestamptz generated via ts_utc)`,
index `(list_id, started_at desc)`, RLS on, no policies. No other schema change
(`isJerseyManager`, `sessionId`, `jerseyManager` live inside `data`).

## 3. Rules (`sales-logic.ts`, pure)

- `orgKey(name): string`; `linkedContacts(contact, all): Contact[]` — same
  list, same `orgKey`, not itself, ordered by `sortOrder` then `createdAt`.
- `planJerseyManager(contact, linked, log, now)` →
  `{ currentPatch: Partial<Contact>; otherPatches: Array<{ id: string; patch: Partial<Contact> }>; newContact: Contact | null }`:
  - `answer === 'self'` → current `isJerseyManager: true`; every linked contact
    with the flag → `false`.
  - `answer === 'other'` with `existingContactId` (must be a linked contact,
    else the action rejects) → that one `true`, current and other linked `false`.
  - `answer === 'other'` with a `person` that has a name or phone →
    `newContact = contactFromPerson(contact, person, now, { isJerseyManager: true })`
    (same sortOrder as the source, `source: 'referral'`,
    `referredFromContactId`, `leadSource: 'Referral'`, notes
    "Named as jersey manager by <contact>"), current and linked → `false`.
  - `answer === 'other'` with nothing filled, or `answer === ''` → no patches.
- `contactFromPerson` replaces `referralContactFrom`; the Referred outcome calls
  it with `{ isJerseyManager: false }` and notes "Referred by <contact>".
- `sessionTallyFor(logs, sessionId)` → `{ calls, reached, voicemails, callbacks, infoSent }`
  over the logs of one session (replaces the by-caller/today tally in the footer).
- `sessionEnd(session, logs)` → `session.endedAt ?? (latest log endedAt in the
  session) ?? session.startedAt` — how an abandoned session is displayed.
- Validation additions (blocking): `jerseyManager.answer` not in `'' | 'self' | 'other'`;
  `existingContactId` given but not a linked contact of this one; `sessionId`
  given but not a session of this list. Nothing about the manager question is
  required — an unanswered question changes nothing.

Queue and buckets are unchanged.

## 4. Repository and actions

Repository additions: `listCallSessions(listId)`, `createCallSession(session, actor)`,
`endCallSession(id, endedAt, actor)`; `getCallList` returns `sessions`.
`addCallLog(log, contactPatch, newContact, actor, extraPatches = [])` gains the
last parameter: the linked contacts' flag changes, written after the current
contact and before the new contact. Write order comment updated accordingly.

Actions: `logCall` builds `extraPatches` / `newContact` from
`planJerseyManager` (plus the Referred path) and passes `sessionId` through;
`startSession(listId, callerName) → { ok, session }` — before creating, any
open session on the same list is ended at `sessionEnd(...)`; `endSession(id)`
sets `endedAt = now`. Both `requireRole('staff')`.

## 5. Pages and components

### Width
`src/app/sales/layout.tsx` wraps children in `<div className="sales-wide">`.
`globals.css`: `body:has(.sales-wide) :is(header > div, main) { max-width: 120rem; }`
— the header row and the main column widen only on Sales routes. The calling
view's fixed footer inner width becomes `max-w-[120rem]`. Landing grid:
`2xl:grid-cols-4`. Calling view: `lg:` two columns as now; `2xl:` three —
contact · script · (notes + call summary).

### Calling view
- Page body: contact panel · script panel · notes + **call summary card**
  (rating and outcome chosen so far, or "No outcome yet", with a *Change*
  button that opens the dialog).
- Footer: `← Previous · Skip → · [Call finished]` (primary). "Call finished"
  opens `FinishDialog` (`role="dialog"`, `aria-modal`, focus moved in, `Esc`
  cancels, Tab cycles inside): heading with the contact's name, `StarRating`,
  the existing `OutcomePanel`, the missing/error line, `Cancel`, `Save & Next`
  (or `Update call` in edit mode). Everything typed in the dialog lives in the
  draft, so cancelling keeps it and reopening shows it.
- Keys: `1–9 0 -` select the outcome **and open the dialog**; `Ctrl+Enter` opens
  the dialog, or saves when it is open and Save is enabled; `Shift+1…5` rate
  anywhere; `Esc` closes the dialog (or blurs a text box).
- "Logged as … — Edit" opens the dialog in edit mode.
- Contact panel gains **Jersey manager** badge, and **Also at this team** —
  each linked contact as a link to their contact page with role, manager badge
  and latest outcome.

### Jersey manager question (script panel)
Kind `jersey_manager` renders the question text, two buttons **This person** /
**Someone else**. "Someone else" reveals: when linked contacts exist, a select
`Who?` with each linked contact ("Pat Singh — Captain/Organiser") and
**Someone new…**; when none exist, or "Someone new…" is chosen, the fields
Name, Role (pick-list), Phone, Email, Note. Draft field `jerseyManager` mirrors
`JerseyManagerAnswer`; `answers[qid]` is set to "This person" / "Someone else"
so history and export label it. Disabled like the rest for DNC / summary state.

### Contact page — `/sales/[id]/contacts/[contactId]`
Read-only. Back link to the table; **Start call** button → `/sales/[id]/call?c=`.
Renders the same `ContactPanel` as the calling view (contact, linked contacts,
history with the session each call belonged to) inside a card. 404 when the
contact is not in the list. The contacts table rows, the Due-today group and
the "Also at this team" links all point here.

### List page — Sessions
Below Due today: **Sessions** — one row per session, newest first: date,
start–end (from `sessionEnd`, marked "open" when `endedAt` is null and the
session started less than 12 hours ago), caller, calls, reached. Expandable
(`<details>`) to the session's calls: time, contact (link), outcome badge.
Sessions with zero calls are still listed.

### Session lifecycle (client)
On mount the calling view reads `sessionStorage['ppc.callSession.<listId>']`;
a JSON `{ id, startedAt }` is reused, anything else (the old plain ISO string,
or nothing) triggers `startSession` and stores the result. The "calling for"
timer counts from the session's `startedAt`. Every `logCall` carries the
session id. The back link calls `endSession` and clears the key. Closing the
tab leaves the session open; the display uses `sessionEnd`.

### Table
A **Mgr** chip after the name of a contact with `isJerseyManager`.

### Export
Two columns appended after `Source`: `Jersey Manager` (Y/N) and
`Linked Contacts` (names of linked contacts joined by `; `). Everything else
unchanged.

### Template and shipped script
Script tab Kind dropdown: `Read, Reminder, Question, Objection, Jersey manager`.
Shipped question 1 becomes kind `jersey_manager`, text *"Who handles the
jerseys for [Org] — is that you, or someone else?"*, no options. Regenerate the
template and fixtures; the import maps Kind "Jersey manager" → `jersey_manager`.

## 6. Tests

`node --test`: `orgKey` / `linkedContacts`; `planJerseyManager` for self,
other-existing, other-new, other-empty, unanswered; `contactFromPerson` for
both callers; `sessionTallyFor`; `sessionEnd`; heal defaults; validation of a
foreign `existingContactId`; export's two new columns and header positions;
import of a Script row with Kind "Jersey manager". Browser: dialog open/close
by button, hotkey and Ctrl+Enter; save through the dialog; edit through the
dialog; manager question all three branches including the new linked row
appearing next in the queue; linked contacts shown on both rows; contact page
from the table and from a link; Start call from the page; sessions listed
with calls; ultra-wide three-column layout at ≥1536px and two columns below.

## 7. Files

New: `src/app/sales/layout.tsx`, `src/app/sales/[id]/contacts/[contactId]/page.tsx`,
`src/components/sales/call-view/finish-dialog.tsx`, `src/components/sales/call-view/call-summary.tsx`,
`src/components/sales/sessions-panel.tsx`, `supabase/migrations/0005_call_sessions.sql`,
`tests/sales/follow-ups.test.ts`.
Changed: `types.ts`, `constants.ts` (no new constants beyond the kind label map),
`sales-logic.ts`, `repository.ts`, `json-store.ts`, `supabase-store.ts`, `seed.ts`,
`migrate-to-supabase.mjs`, `actions.ts`, `globals.css`, `sales/page.tsx`,
`sales/[id]/page.tsx`, `call-view/index.tsx`, `contact-panel.tsx`, `script-panel.tsx`,
`use-draft.ts`, `use-timers.ts`, `use-keyboard.ts`, `history.tsx`, `import.ts`,
`export.ts`, `default-script.json`, `build-call-template.mjs`, the two fixtures,
`export.test.ts`, `import.test.ts`, `sales-logic.test.ts`, `CLAUDE.md`.
