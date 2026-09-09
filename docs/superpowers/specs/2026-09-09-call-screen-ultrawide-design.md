# Sales — the calling screen, rebuilt for a 3440×1440 ultrawide

Date: 2026-09-09. Brief: `docs/call-view-prompt.md` (Keenan's own). Follows
the row-actions change (`2026-09-08-sales-row-actions-design.md`).

## Decisions made with Keenan (his one round of answers)

- **AI summary (brief §7): not in this pass.** Nothing AI-related is added.
- **Playwright is added** as a dev dependency with the seven checks from the
  brief at 3440×1440, run with `npm run test:e2e` against a JSON store in a
  temp directory — never Supabase, never `data/db.json`.
- **Outcomes that need a commitment show a strip and log on Enter / Log.**
  Callback, Send info, Meeting booked, Interested, Not now, Not interested,
  Referred, Bad number and Do Not Call each reveal only their own fields and
  log on a second click (or Enter). **No answer and Voicemail log on the
  single click** and advance immediately.
- **The five typed discovery questions replace the default script's four
  overlapping discovery questions.** Any other `question` row a sheet
  carries in Discovery still renders under the five.

Decided by me where the brief left room:

- The referral / "someone else looks after the jerseys" flow already creates
  a linked contact (`planJerseyManager`, `contactFromPerson`). It is reused
  as is, inline, not in a modal.
- Latest discovery answers are also merged onto the **contact**
  (`Contact.discovery`) by `applyCallLog`, so the contacts table and the CSV
  can filter on them later without walking every log.
- History moves from the Contact column to the fourth column, as the brief's
  diagram shows. The read-only contact page keeps history under the contact.
- Do Not Call keeps a confirm strip: it is the one irreversible outcome and a
  mis-click on a big button is easy.
- Type scale is set with explicit sizes, not a root-font change, so the rest
  of the app is untouched.

## Model

### `CallList` gains

- `pickupLine: string` — the sentence said when they answer. Biggest text on
  the screen. Editable in place. `''` shows a placeholder prompt.
- `quickFacts: string` — free text, one editable block per list, shown under
  the contact. Rendered `whitespace-pre-wrap`; lines starting with `- ` show
  as bullets.

`healCallList` fills both with `''`. No migration: JSONB.

### `CallLog` and `Contact` gain `discovery: Discovery`

```ts
export const LAST_REDONE_OPTIONS = ['under_1', '1_2', '2_3', '3_5', '5_plus', 'never'] as const;
export type LastRedone = '' | (typeof LAST_REDONE_OPTIONS)[number];
export const LOOKING_AT_OPTIONS = ['jersey_only', 'jerseys_socks', 'full_set', 'replacement'] as const;
export type LookingAt = '' | (typeof LOOKING_AT_OPTIONS)[number];
export const SUPPLIER_PRIORITIES = ['turnaround', 'durability', 'design_help', 'low_minimums', 'price'] as const;
export type SupplierPriority = (typeof SUPPLIER_PRIORITIES)[number];

export interface Discovery {
  lastRedone: LastRedone;                 // Q2
  satisfaction: LeadRating | null;        // Q3 — their opinion of the current set, NOT leadRating
  changeOneThing: string;                 // Q3
  lookingAt: LookingAt;                   // Q4
  home: boolean;                          // Q4
  away: boolean;                          // Q4
  primaryPriority: SupplierPriority | ''; // Q5 first tap
  alsoPriorities: SupplierPriority[];     // Q5 further taps
}
```

Q1 (who looks after the jerseys) stays `CallLog.jerseyManager`.

Labels live in `constants.ts` (`LAST_REDONE_LABELS`, `LOOKING_AT_LABELS`,
`SUPPLIER_PRIORITY_LABELS`). `blankDiscovery()` in `sales-logic.ts`;
`healCallLog` and `healContact` fill it. `mergeDiscovery(base, next)`: every
answered field of `next` overwrites, unanswered ones leave `base` alone;
`applyCallLog` writes `patch.discovery = mergeDiscovery(contact.discovery,
log.discovery)`. `validateCallLog` blocks bad enum values.

CSV export appends eight columns after *Linked Contacts*: Jerseys Last
Redone, Happy With Last Set, Change One Thing, Looking At, Home, Away, Top
Priority, Also Mentioned.

### Script editing

The list's `script` is edited in place: opening lines and objections from
the calling screen. `saveListScript(listId, items)` replaces the whole array
after `validateScript` (valid section and kind, non-empty text, objections
capped at 8, ids assigned to new rows with `withScriptIds`). The spreadsheet
Script tab still works and still replaces the script on upload. Editing
keeps existing ids so past answers still resolve.

`updateListText(listId, { pickupLine?, quickFacts? })` writes those two
fields through `repo.updateCallList`.

## The screen (`/sales/[id]/call`)

At **1600px and wider**, the page is a fixed-height grid that never scrolls:

```
top bar: ← list · queue position · session timer · timer here · ? help
┌────────────┬───────────────────────┬──────────────┬────────────────┐
│ CONTACT    │ PICKUP LINE (28px)    │ OBJECTIONS   │ NOTES          │
│ (scrolls)  │ ① OPENING  [✓ ⌄]      │ chips grid   │ HOW DID THE    │
│            │   reminders + lines   │ → response   │ CALL GO?       │
│            │   (20px)              │  (20px)      │ (permanent)    │
│ QUICK      │ ② DISCOVERY           │              │ HISTORY        │
│ FACTS      │   Q1–Q5, sheet extras │              │ (scrolls)      │
│            │ CLOSE (small)         │              │                │
└────────────┴───────────────────────┴──────────────┴────────────────┘
footer: ← Previous · Skip → · session tally
   440px          minmax(0,1fr)          700px            600px
```

- `body:has(.call-screen)` becomes a full-height flex column with
  `overflow: hidden`; `main` loses its width cap and bottom padding; the
  call screen fills what is left. Each column is `min-h-0 overflow-y-auto`.
  Nothing reflows on a tap: panels change content in place, never height of
  the grid.
- Below 1600px: the existing stacked layout, normal page scroll, footer at
  the end. Not invested in.
- Sizes on the wide layout: pickup line 28px semibold; opening and objection
  responses 20px; question text 16px; labels 13px; outcome buttons 15px with
  tall padding; contact name 30px.

### Column 1 — Contact + Quick facts

`ContactPanel` unchanged in content, `showHistory={false}` here. Under it a
*Quick facts* box: the list's `quickFacts`, pencil → textarea → Save.

### Column 2 — Script

- **Pickup line.** Biggest text. Pencil → one-line input → Save. Empty shows
  "Add the line you say when they pick up".
- **① Opening.** Header with a collapse toggle; collapsed shows a gold ✓ and
  the first line's opening words. Expanded by default for each new contact.
  Content: the sheet's opening reminders (tick) and read lines at 20px with
  placeholders filled. Pencil → each line becomes editable (kind: read or
  reminder; text), lines can be added, removed, moved up/down; Save writes
  the script. Show-When rules on edited lines are kept as they were.
- **② Discovery.** Five fixed questions, one tap each:
  1. *Who looks after the jerseys?* — the existing inline
     `JerseyManagerQuestion` (Them / Someone else → linked pick-list or new
     person block).
  2. *When were the jerseys last redone?* — a six-stop track (Under 1 yr ·
     1–2 · 2–3 · 3–5 · 5+ · Never / don't know); one tap sets the stop; arrow
     keys move it; tap the same stop to clear.
  3. *Happy with the last set?* — `StarRating` (their opinion) plus "If you
     could change one thing…" text.
  4. *What would they be looking at?* — Jersey only · Jerseys + socks · Full
     set · Replacement jerseys, plus Home / Away toggles under all four.
  5. *What matters most in a supplier?* — five chips: first tap is the
     primary (gold, "1st"), further taps add "also"; tapping again removes.
  Then any remaining sheet `question` / `reminder` rows in Discovery.
- **Close** — the sheet's close lines, small, at the bottom.

### Column 3 — Objections

The list's objections as a chip grid, all visible (max 8). Tap → the
column shows the objection as a heading and its response at 20px, with a
"← Back to objections" button; tap the heading or Back to return. Pencil →
edit list (text + response per row, add up to 8, remove), Save writes the
script. The panel header shows "n / 8".

### Column 4 — Notes, outcome, history

- **Notes** textarea (`/` focuses it). Drafts still autosave per contact.
- **How did the call go?** Permanent board: lead rating stars (Shift+1–5),
  then two labelled rows of big buttons — *Didn't reach them* (No answer,
  Voicemail, Bad number, Gatekeeper / Referred) and *Talked to them*
  (Interested, Send info, Callback, Meeting booked, Not now, Not interested,
  Do not call). Hotkeys 1–9, 0, - as today.
  - No answer / Voicemail: one click logs and advances.
  - Every other outcome: click highlights it and opens a strip under the
    rows with only that outcome's fields (the existing per-outcome fields,
    seeded as today) and a **Log & next** button. Enter in a strip field or
    Ctrl+Enter logs. Esc clears the outcome and closes the strip.
  - A Do Not Call contact: only Do Not Call is enabled.
  - After logging, the queue advances. Coming back with Previous shows the
    logged outcome and an Edit button that reloads the call into the board
    and changes the button to *Update*.
  - Errors from the server show in the strip; nothing is lost.
- **History**: the contact's calls, newest first, scrolling. Each entry now
  also lists its discovery answers in one line.

`finish-dialog.tsx` and `call-summary.tsx` are deleted. `outcome-panel.tsx`
stays for the contacts table's *Change status* dialog. `footer-bar.tsx`
loses the finish button and is no longer fixed; it is the grid's last row
(or the last block when stacked).

## Code

- `types.ts`, `constants.ts`, `sales-logic.ts` (blankDiscovery,
  mergeDiscovery, heal lines, applyCallLog, validateCallLog additions,
  validateScript, withScriptIds, blankCallList fields, healCallList).
- `json-store.ts`: `PPC_DATA_DIR` env overrides the data directory (for the
  e2e run). Nothing else in the stores changes; `updateCallList` already
  exists.
- `actions.ts`: `saveListScript`, `updateListText`.
- `export.ts`: eight discovery columns.
- `default-script.json`: the four overlapping discovery questions removed
  ("Roughly how many teams" stays). Template and fixtures regenerated.
- `call-view/`: `index.tsx` (layout, state, keys), `pickup-line.tsx`,
  `opening-panel.tsx`, `discovery-panel.tsx`, `jersey-manager-question.tsx`
  (moved out of `script-panel.tsx`, which is deleted), `objections-panel.tsx`,
  `outcome-board.tsx`, `quick-facts.tsx`, `close-panel.tsx`,
  `inline-edit.tsx` (the shared pencil / Save / Cancel frame),
  `contact-panel.tsx` (`showHistory`), `history.tsx` (discovery line),
  `use-draft.ts` (discovery), `use-keyboard.ts` (Enter in a strip handled
  by the strip itself; otherwise unchanged), `footer-bar.tsx`.
- `globals.css`: the `.call-screen` rules. `call/page.tsx` renders the
  wrapper.
- Playwright: `@playwright/test` dev dependency, `playwright.config.ts`,
  `tests/e2e/call-screen.spec.ts`, `npm run test:e2e`. The config starts
  `next start` with `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` blank and
  `PPC_DATA_DIR` pointing at a fresh temp directory, reads the access code
  from `admin-code.txt`, creates a list, uploads the sample sheet, and runs
  the seven checks. `npm run build` first (documented).

## Tests

- `tests/sales/discovery.test.ts`: `blankDiscovery`, `mergeDiscovery`
  (answered overwrites, unanswered keeps, `alsoPriorities` replaced not
  unioned), `applyCallLog` writes the merge, `healCallLog` / `healContact`
  fill it, `validateCallLog` blocks a bad `lastRedone`.
- `tests/sales/script-edit.test.ts`: `withScriptIds` keeps existing ids and
  numbers new rows after the max; `validateScript` rejects a blank text, an
  unknown kind, a ninth objection.
- Existing import / export tests updated for the shorter default script and
  the new export columns.
- Playwright (`tests/e2e/call-screen.spec.ts`), the brief's seven checks.

## Out of scope

AI summary (§7), a phone layout for this screen, filtering the contacts
table by discovery answers (the data is now there for it), editing the
Discovery or Close sections in the browser.

## Revision, 2026-09-09 — after Keenan tried it

Three changes from his review:

1. **Discovery is exactly the five questions.** Nothing from the sheet
   renders under them any more (`DiscoveryPanel` reads only the sheet's
   `jersey_manager` line, for its wording). The default script drops its
   last discovery question; a sheet may still carry extra discovery rows —
   they are ignored on screen and still exported as columns.
2. **The pickup line is set in Settings, not in place.** A ⚙ *Settings*
   button in the top bar (and next to the pickup line) opens a side sheet
   (`call-settings.tsx`) with two texts per list: the pickup line and the
   **voicemail message** (new `CallList.voicemailScript`, healed to `''`,
   saved by `updateListText`). The pickup line on screen is view-only.
   Opening lines, objections and quick facts keep their in-place pencils.
3. **"Went to voicemail" in the expanded Opening.** A button under the
   opening lines; pressing it shows the voicemail message at read-aloud
   size (placeholders filled) with two buttons: *Left the message — log
   Voicemail & next* (the same one-click Voicemail log as the board) and
   *They picked up after all*. The Opening panel is keyed by contact so the
   prompt closes when the contact changes.

Playwright gains two checks: Settings sets both texts (the pickup line
renders at 28px with placeholders filled), and Went to voicemail shows the
message and logs Voicemail on one click. The "five questions" check now
also asserts there are exactly five.
