# Prompt for Claude Code — rework the calling screen for an ultrawide monitor

---

Rework the calling screen (`/sales/[id]/call`). This is my personal tool on a
**3440×1440 ultrawide** — it is not a product for anyone else. Optimise for that
screen. Do not spend effort making it good on a small laptop.

Read `CLAUDE.md` first. Everything in it still applies.

## What I measured, so you don't have to guess

I ran the current screen at 3440×1440 with three real contacts loaded:

- The sales routes are capped at **120rem (1920px)** and centred, so there is
  **~770px of dead black down each side**. I'm using barely half my monitor.
- All content sits in the **top ~25%** of a 1440px screen. The rest is empty.
- Body text is **11–13px**. On a 34" screen at arm's length, reading a script
  aloud from that is a squint.

So it manages to feel cramped and empty at once. That's the thing to fix.

## What is already good — do not rebuild these

`ContactPanel` is genuinely well done and should keep all its content: name,
role, org, big phone, **local time with the timezone logic** (it correctly told
me it was 2:46 a.m. in Saskatoon), priority, best time to call, league, team and
player counts, current supplier and last order year, sheet notes, call history.

Also keep as-is: the queue position, call timers (`use-timers`), keyboard
shortcuts (`use-keyboard`), session stats in the footer, the draft autosave
(`use-draft`), and the 11 outcomes in `CALL_OUTCOME_META`.

---

## 1. Layout — the biggest win, and it touches no data

**Files:** `src/app/sales/layout.tsx`, `globals.css`, `src/components/sales/call-view/index.tsx`

- **Remove the width cap for the calling screen specifically.** Not 120rem —
  let it use the screen, with sensible padding. Keep 120rem for the rest of
  sales if you like; the calling screen is the one that needs the width.
- **Four full-height columns**, roughly:

```
┌──────────────┬─────────────────────────┬─────────────────┬───────────────┐
│ CONTACT      │ ① OPENING     [collapse]│ ③ OBJECTIONS    │ NOTES         │
│ + QUICK      │ ② DISCOVERY             │  chips → answer │ HOW DID THE   │
│   FACTS      │   (the five questions)  │                 │ CALL GO?      │
│              │                         │                 │ HISTORY       │
└──────────────┴─────────────────────────┴─────────────────┴───────────────┘
   ~440px            ~900px flexible           ~700px          ~600px
```

- Columns run the **full height of the viewport**. Each scrolls **internally**
  if its content is too tall (`min-h-0` + `overflow-y-auto` on the inner box).
  **The page itself must never scroll**, and nothing may reflow or jump when I
  tap something mid-call.
- **Raise the type scale on this screen.** Script text I read aloud ~20px,
  questions ~16px, field labels 13px. Right now everything is one small size,
  which is why nothing guides the eye. One thing should be big on purpose.
- Below ~1600px, fall back to the current stacked behaviour. Don't invest in it.

---

## 2. Opening script — editable in the browser

Right now the script can only come from a **Script tab in an uploaded
spreadsheet**. The screen literally says *"This list has no script. Add a
Script tab to the sheet and re-upload."* That's the blocker: I want to reword an
opening line the moment a call goes badly, not rebuild a spreadsheet.

- Add **in-browser editing of a list's script**, at least for the `opening`
  section: click, type, save. Keep the spreadsheet import working — it's fine as
  a bulk path, it just can't be the only path.
- Add a **pickup line** — the single sentence I say when they answer. Biggest
  text on the screen. Per list. If `ScriptItem` needs a new `section` or a flag
  for it, add one and heal old rows.
- The Opening panel is **expanded by default** and **collapsible**. Once
  collapsed the header keeps a gold tick so I know it's done. Collapsing gives
  its space to Discovery.

---

## 3. Discovery — five questions

**Two of these are already modelled — use what exists, don't duplicate it.**

**Q1. Who looks after the jerseys?** — `JerseyManagerAnswer` already exists
(`answer: 'self' | 'other'`, `existingContactId`, `person{name,role,phone,email,note}`)
and `Referral` exists on `CallLog`. Just build the UI:
`Them` / `Someone else` → *Someone else* opens an **inline block, not a modal**
(a popup covering the screen mid-call is the worst possible moment for one):
role dropdown + name / phone / email.
**That person should become a new contact on this list**, tagged as referred by
this contact. Ask me before wiring that if you think it's wrong — but a name
that only lands in a note is a warm lead I lose.

**Q2. When were the jerseys last redone?** — new field. Slider with named stops:
`Under 1 yr · 1–2 · 2–3 · 3–5 · 5+ · Never / don't know`

**Q3. Happy with the last set?** — 1–5 stars (reuse
`src/components/sales/star-rating.tsx`), plus one short text field: *"if you
could change one thing…"*.
Note this is **separate from `leadRating`** — that's my read on the lead, this
is their opinion of their current jerseys. Don't merge them.

**Q4. What would they be looking at?** — new field.
`Jersey only` · `Jerseys + socks` · `Full set` · `Replacement jerseys`
plus `Home` and `Away` checkboxes, available on **all four** options.

**Q5. What matters most in a supplier?** — new field.
`Turnaround · Durability · Design help · Low minimums · Price`
First tap = their primary. Extra taps = also mentioned.

**Store these as real typed fields on `CallLog`, not as free text in `answers`.**
The point is that later I can query *"everyone whose jerseys are 3+ years old
who cares about turnaround"* and call that list next. Free text can't do that.

Every question must be answerable in **one tap**. Typing only where it's a real
detail (the referral's contact info, the "change one thing" line).

---

## 4. Objections — its own always-visible column

The data already supports this: `ScriptItem` with `kind: 'objection'` has both
`text` and `response`, and `SCRIPT_SECTIONS` includes `objections`. There's just
no UI.

- Render the list's objections as a **grid of chips**, all visible at once.
- Tap one → its `response` fills the column, at read-aloud size. Tap again to go
  back to the chips.
- **Editable in the browser**, same as the opening script — when I hear a new
  objection twice I want to add it that evening.
- Cap it around 8. Never a scrolling list: hunting for an objection while
  someone is talking defeats the point.

---

## 5. "How did the call go?" — replace the dialog

**Files:** `outcome-panel.tsx`, `finish-dialog.tsx`, `call-summary.tsx`

Currently it's a small **Call finished** button that opens a **modal**, with 11
outcomes inside it. Two problems: it's a modal at the exact moment I'm hanging
up, and the valuable part — what I learned, what I promised — is a bare textarea.

- Make it a **permanent panel**, bottom-right, always visible. No dialog.
- Big buttons in two labelled rows, using the existing `group` field:

```
DIDN'T REACH THEM   No answer · Voicemail · Bad number · Gatekeeper
TALKED TO THEM      Interested · Send info · Callback · Meeting booked
                    Not now · Not interested · Do not call
```

- **One click logs the call and advances to the next contact.** No confirm step.
- **Only the outcomes that need a commitment ask for one.** Callback / Send info
  / Meeting booked reveal a small strip — follow-up date and "what I promised".
  No answer reveals nothing, because there's nothing to say. Bad number already
  has `newPhone`; Not interested already has `reason`; keep those, same rule.
- Keep the existing keyboard shortcuts working against the same buttons.

---

## 6. Quick Facts panel

Pinned under Contact. Static text per list, **editable in the browser**: lead
times per build type, what's in a full set, minimums, free shipping in Canada,
sizing chart link. The things I get asked mid-sentence.

Same storage approach as the script — one editable block per list, nothing
structured.

---

## 7. AI summary — last, and only if the rest is done

When I click an outcome, take my shorthand notes plus the five discovery answers
and produce: a clean two-line summary for the record, a suggested follow-up date
and action, and a flag if something contradicts an earlier call on this contact.
Show it to me **before** it saves so I can edit or bin it.

⚠️ **This is the only part needing a new dependency** — an Anthropic API key and
a server action. It must run **after** the call, never during: nothing may make
me wait mid-call. If the key is missing, everything else must still work; degrade
silently.

**Build 1–6 first.** Treat 7 as separate.

---

## Architecture — same rules as the rest of the app

- New fields on `CallLog` → add a `heal` line so old rows don't crash the first
  page that reads one.
- Everything through `repo`, implemented in **both** stores; store-agnostic
  rules in `sales-logic.ts`, not in either store.
- Mutations are server actions in `src/app/sales/actions.ts`, `requireRole`
  first, then `revalidatePath`.
- Watch any `EDITABLE`-style allowlist — a field missing from one renders,
  updates on screen, and is silently dropped before the database. That's shipped
  four broken controls in this project already.
- Supabase: same JSONB + generated column pattern; generated columns must be
  immutable (use `date_iso` / `ts_utc` from migration `0000`).
- Dark theme, gold accent, existing components in `src/components/ui.tsx`.

---

## Before you build

Show me the plan: the new `CallLog` fields, which files you'll touch, and
anything above you think is a bad idea. Then build it, get `npm run build` and
`npx tsc --noEmit` clean, and cover with Playwright at **3440×1440**:

- the page does not scroll — `document.scrollHeight <= window.innerHeight`
- all four columns are visible, and content spans most of the width
- Opening collapses and Discovery takes the space
- each of the five questions records against the `CallLog`
- an objection chip expands its response and collapses again
- one outcome click logs the call and advances the queue
- Callback shows the follow-up strip; No answer doesn't
