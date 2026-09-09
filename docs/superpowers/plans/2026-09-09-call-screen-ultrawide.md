# Call Screen Ultrawide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/sales/[id]/call` for a 3440×1440 monitor: four full-height columns that never scroll the page, an editable pickup line / opening / objections / quick facts per list, five typed discovery questions stored on the call log, and a permanent outcome board that logs in one click.

**Architecture:** New typed fields on `CallLog` and `Contact` (`discovery`) and on `CallList` (`pickupLine`, `quickFacts`), healed on read, merged onto the contact by `applyCallLog`. Script editing replaces `list.script` through the existing `updateCallList`. The calling view becomes a fixed-height grid of independent panels; each panel owns one concern and talks to the draft through `patch`. Outcome logging reuses `logCall` untouched.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, `node --test`, Playwright (new, dev only).

**Spec:** `docs/superpowers/specs/2026-09-09-call-screen-ultrawide-design.md`

## Global Constraints

- Call state on a contact is written only by `applyCallLog` / `applySkip`. The discovery merge lives there.
- Every new field gets a heal line (`healCallLog`, `healContact`, `healCallList`) in `sales-logic.ts`.
- Mutations are server actions: `requireRole('staff')` → `currentActor()` → rules → `repo` → `revalidatePath`.
- The page must not scroll at ≥1600px; every column scrolls internally; tapping never changes the grid's height.
- Sizes: pickup 28px, read-aloud text 20px, questions 16px, labels 13px.
- `npm test`, `npx tsc --noEmit`, `npm run build` clean; Playwright checks pass at 3440×1440.

## New fields (the brief asked for these first)

| Where | Field | Type |
|---|---|---|
| `CallLog`, `Contact` | `discovery` | `Discovery` (below) |
| `CallList` | `pickupLine` | `string` |
| `CallList` | `quickFacts` | `string` |

```ts
Discovery {
  lastRedone: '' | 'under_1' | '1_2' | '2_3' | '3_5' | '5_plus' | 'never';
  satisfaction: 1|2|3|4|5 | null;   // their opinion of the current set — not leadRating
  changeOneThing: string;
  lookingAt: '' | 'jersey_only' | 'jerseys_socks' | 'full_set' | 'replacement';
  home: boolean; away: boolean;
  primaryPriority: '' | 'turnaround' | 'durability' | 'design_help' | 'low_minimums' | 'price';
  alsoPriorities: SupplierPriority[];
}
```

## Files

- Modify: `src/lib/types.ts`, `src/lib/constants.ts`, `src/lib/data/sales-logic.ts`, `src/lib/data/json-store.ts` (data dir env), `src/app/sales/actions.ts`, `src/lib/sales/export.ts`, `src/lib/sales/default-script.json`, `src/app/globals.css`, `src/app/sales/[id]/call/page.tsx`, `src/components/sales/call-view/{index.tsx,contact-panel.tsx,history.tsx,use-draft.ts,use-keyboard.ts,footer-bar.tsx}`, `package.json`, `CLAUDE.md`, tests.
- Create: `src/components/sales/call-view/{pickup-line,opening-panel,discovery-panel,jersey-manager-question,objections-panel,outcome-board,quick-facts,close-panel,inline-edit}.tsx`, `tests/sales/discovery.test.ts`, `tests/sales/script-edit.test.ts`, `playwright.config.ts`, `tests/e2e/call-screen.spec.ts`.
- Delete: `src/components/sales/call-view/{finish-dialog,call-summary,script-panel}.tsx`.

---

### Task 1: Discovery model, heal, merge, export

- [x] `types.ts`: the enums and `Discovery` above; `CallLog.discovery`, `Contact.discovery`, `CallList.pickupLine`, `CallList.quickFacts`.
- [x] `constants.ts`: `LAST_REDONE_LABELS`, `LOOKING_AT_LABELS`, `SUPPLIER_PRIORITY_LABELS` (`Record<…, string>`).
- [x] `sales-logic.ts`: `blankDiscovery()`; `blankContact` and `blankCallLogInput` include it; `blankCallList` includes `pickupLine: ''`, `quickFacts: ''`; `healCallList` fills both; `healCallLog` fills `discovery` (and `discovery.alsoPriorities ??= []`); `mergeDiscovery(base, next)`; `applyCallLog` adds `discovery: mergeDiscovery(contact.discovery, log.discovery)`; `validateCallLog` blocks a bad `lastRedone` / `lookingAt` / priority value.
- [x] `export.ts`: eight columns after *Linked Contacts* from `c.discovery`.
- [x] Test `tests/sales/discovery.test.ts` (merge semantics, applyCallLog, heal, validation). Fix `tests/sales/export.test.ts` header expectations if any index moved (none should — columns are appended).
- [x] Commit: `Sales: typed discovery answers on calls and contacts`.

### Task 2: Script editing rules and actions

- [x] `sales-logic.ts`: `MAX_OBJECTIONS = 8`; `withScriptIds(items)` — keeps ids, assigns `s<n>` after the current max to rows with `id === ''`; `validateScript(items): { ok: true; items } | { ok: false; error }` — section in `SCRIPT_SECTIONS`, kind in `SCRIPT_KINDS`, non-empty text, objections ≤ 8, `options`/`response`/`showWhen` defaulted.
- [x] `actions.ts`: `saveListScript(listId, items)` → validate → `repo.updateCallList({ ...list, script, updatedAt })` → revalidate → `{ ok: true; script }`; `updateListText(listId, patch: { pickupLine?: string; quickFacts?: string })` → `{ ok: true; list }`.
- [x] `json-store.ts`: `const DATA_DIR = process.env.PPC_DATA_DIR || path.join(process.cwd(), 'data')`.
- [x] `default-script.json`: remove the four overlapping discovery questions; `npm run build:template` + fixtures; update `tests/sales/import.test.ts` counts (script length 16; `script[7]` is now the free-text "Roughly how many teams" question) and `export.test.ts` if it depends on them.
- [x] Test `tests/sales/script-edit.test.ts`.
- [x] Commit: `Sales: script editing rules and actions; default script trimmed`.

### Task 3: Draft, keyboard, footer, contact panel, history

- [x] `use-draft.ts`: `CallDraft.discovery`, `blankDraft`, `inputFromDraft`, `draftFromLog`.
- [x] `use-keyboard.ts`: rename `onFinish` → `onLog` (Ctrl+Enter); everything else unchanged.
- [x] `footer-bar.tsx`: drop the finish button and the `fixed` positioning; props `canPrevious/onPrevious/canSkip/onSkip/tally/onHelp`.
- [x] `contact-panel.tsx`: `showHistory?: boolean` (default true); name at `text-3xl` on wide screens.
- [x] `history.tsx`: a one-line discovery summary per entry (only answered fields).
- [x] tsc will fail in `index.tsx` until Task 5 — that's expected; commit anyway: `Sales call view: draft, keys, footer, history for the new screen`.

### Task 4: The panels

- [x] `inline-edit.tsx`: `InlineEdit({ title, editing, onEdit, onCancel, onSave, saving, error, children, view })` — header row with the section title, a pencil (or Save / Cancel while editing), the error line.
- [x] `pickup-line.tsx`: view at 28px; edit = one input; `updateListText`.
- [x] `quick-facts.tsx`: view `whitespace-pre-wrap` with `- ` bullets; edit = textarea; `updateListText`.
- [x] `opening-panel.tsx`: props `items` (opening rows, filled), `rawItems` (unfilled, for editing), `checklist`, `onTick`, `open`, `onToggle`, `onSaveScript(items)`; collapsed header shows ✓ + preview; edit mode: rows with kind select (read / reminder) + textarea, add / remove / up / down.
- [x] `jersey-manager-question.tsx`: moved verbatim from `script-panel.tsx`.
- [x] `discovery-panel.tsx`: Q1 (`JerseyManagerQuestion`), Q2 track, Q3 stars + text, Q4 choices + Home/Away, Q5 chips; then remaining sheet rows (`question` → `ChoiceGroup` / input, `reminder` → `Toggle`); props `discovery`, `onDiscovery(patch)`, `answers`, `onAnswer`, `checklist`, `onTick`, `jerseyManager`, `onJerseyManager`, `linked`, `extras`, `disabled`.
- [x] `close-panel.tsx`: the close rows, small.
- [x] `objections-panel.tsx`: chips / response / edit modes; `onSaveScript`.
- [x] `outcome-board.tsx`: stars; two rows; strip with the per-outcome fields (copied from `outcome-panel.tsx` so the table dialog keeps its own); `Log & next` / `Update`; props `draft, onChange, contact, today, disabled, errors, warnings, missing, saving, error, logged, onLog, onClear, onEdit, editing`.
- [x] Commit: `Sales call view: panels for the ultrawide screen`.

### Task 5: Layout and orchestration

- [x] `globals.css`:
  ```css
  @media (min-width: 1600px) {
    body:has(.call-screen) { height: 100dvh; overflow: hidden; display: flex; flex-direction: column; }
    body:has(.call-screen) > header { flex: none; }
    body:has(.call-screen) main { flex: 1 1 auto; min-height: 0; max-width: none; padding: 0.75rem 1rem 0.75rem; display: flex; flex-direction: column; }
    body:has(.call-screen) header > div { max-width: none; }
  }
  ```
- [x] `call/page.tsx`: wrap `<CallView>` in `<div className="call-screen contents">`? No — the wrapper must be the flex child: `<div className="call-screen flex min-h-0 flex-1 flex-col">`.
- [x] `index.tsx` rewrite: state as today minus `finishOpen`; add `list` state (script edits apply locally), `openingOpen` (reset per contact), `objectionId`; grid `min-[1600px]:grid min-[1600px]:grid-cols-[440px_minmax(0,1fr)_700px_600px] min-[1600px]:grid-rows-[auto_minmax(0,1fr)_auto]`; stacked below. Save flow unchanged; `onOutcome(i)`: no_answer / voicemail → set outcome and `save()` at once; others → `patch(seedForOutcome(...))`.
- [x] Delete `finish-dialog.tsx`, `call-summary.tsx`, `script-panel.tsx`.
- [x] tsc, lint, `npm test`; browser at 3440×1440 (resize tool) for the seven checks; commit `Sales: the calling screen rebuilt for the ultrawide`.

### Task 6: Playwright

- [x] `npm i -D @playwright/test`, `npx playwright install chromium`.
- [x] `playwright.config.ts`: viewport 3440×1440, `baseURL` `http://localhost:3010`, `webServer` = `npx next start -p 3010` with env `SUPABASE_URL=''`, `SUPABASE_SERVICE_ROLE_KEY=''`, `PPC_DATA_DIR=<tmp>`; `reuseExistingServer: false`.
- [x] `tests/e2e/call-screen.spec.ts`: unlock with the code from `admin-code.txt` (or `ADMIN_ACCESS_CODE`), create a list, upload `tests/sales/fixtures/sample-list.xlsx`, open the calling view, run the seven checks.
- [x] `package.json`: `"test:e2e": "playwright test"`; `.gitignore`: `test-results/`, `playwright-report/`.
- [x] `npm run build && npm run test:e2e` green. Commit `E2E: the calling screen at 3440×1440`.

### Task 7: Docs and finish

- [x] CLAUDE.md Sales section: discovery fields, script editing, the fixed-height screen rule, how to run e2e.
- [x] Full verification, then finishing-a-development-branch → merge to local main.
