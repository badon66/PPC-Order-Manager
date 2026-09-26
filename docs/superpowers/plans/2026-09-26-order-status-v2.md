# Customer Order Status v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage-specific customer pages (design, details) with a colours note; one repeatable "Payment received" email for any payment; copy changes to five emails; a separate review-and-referral email; finished-jersey photos uploaded by staff and attached to the Final payment email.

**Architecture:** The pure modules from round one (`timeline.ts`, `customer-updates-logic.ts`, `update-mail.ts`) grow; two new customer routes reuse `ClientForm` with forced sections; the sender learns attachments; the panel gains three cards (payment received, review request, photos). Spec: `docs/superpowers/specs/2026-09-26-order-status-v2-design.md`. Round-one spec and plan explain the existing pieces.

**Tech Stack:** unchanged (Next.js app router, TypeScript, node:test via `npm test`, nodemailer 7, Supabase or JSON store, Tailwind).

## Global Constraints

- **Money rule** (CLAUDE.md): an amount appears only in the three request emails, typed at send time, stored nowhere. The payment-received email names the payment kind, never an amount.
- **Dates never pass through a timezone** (`YYYY-MM-DD` strings; helpers in `src/lib/dates.ts`).
- **Emails ask first**: nothing sends on a status change; only the approval receipt is automatic.
- **Public pages** never expose contact details beyond the existing `/share` block, nor `customerEmails`, nor the raw change log.
- **Escaping**: every person-typed value reaching HTML goes through `esc()`.
- **Best effort mail**: a failed send is a return value and a log line.
- Existing behaviour that must survive: the twelve-stage timeline, the approval auto-move, the confirmation email, Settings.
- `npx tsc --noEmit -p .` and `npm test` (126 pass at the start) before every commit; `npx eslint <files>` clean on touched files; never commit `data/` or `.next/`.
- Do not run `npm run dev` against the live database. If a task needs a browser look, use `SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= PPC_DATA_DIR=.superpowers/devdata npx next dev --webpack` from Git Bash and stop it afterwards.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; `git add <paths>` only.

---

## File structure

Create:
- `src/lib/data/stage-pages.ts` — pure: `STAGE_SECTIONS`, `stagePagePaths(token)`, `StagePage` type.
- `src/app/roster/[token]/design/page.tsx`, `src/app/roster/[token]/details/page.tsx`.
- `src/components/finished-photos.tsx` — client uploader for `finished_photo` assets.
- Tests under `tests/status/` and `tests/intake/`.

Modify:
- `src/lib/types.ts` (stages, labels, `PaymentKind`, `CustomerEmailRecord.detail`, `ASSET_ROLES`, `ClientRosterSubmission.colours`), `src/lib/mail.ts` (attachments), `src/lib/data/logic.ts` (`healSubmission`, `diffSubmissions`, `planAcceptance`, views pass stage paths), `src/lib/data/submission-logic.ts` (colours), `src/lib/data/customer-updates-logic.ts`, `src/lib/data/update-mail.ts`, `src/lib/data/timeline.ts`, `src/lib/customer-updates.ts`, `src/app/orders/[id]/update-actions.ts`, `src/app/roster/[token]/actions.ts`, `src/app/roster/[token]/client-form.tsx`, `src/components/submission-review.tsx`, `src/components/artwork-gallery.tsx`, `src/components/timeline.tsx`, `src/components/send-update-panel.tsx`, `src/app/orders/[id]/page.tsx`.

---

### Task 1: Types, labels, roles, attachments

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/mail.ts`, `src/lib/data/logic.ts` (`healSubmission`), `src/components/artwork-gallery.tsx` (`ROLE_LABELS`, `ROLE_ORDER`)
- Test: `tests/status/types.test.ts` (extend)

**Interfaces produced:**
```ts
// types.ts
export const UPDATE_STAGES = [ ...the twelve..., 'payment_received', 'review_request' ] as const;   // 14
UPDATE_STAGE_LABEL: + payment_received: 'Payment received', review_request: 'Review and referral'
export const PAYMENT_KINDS = ['initial_deposit', 'production_deposit', 'final_payment'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];
export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = { initial_deposit: 'initial deposit', production_deposit: 'pre-production deposit', final_payment: 'final payment' };
export interface CustomerEmailRecord { stage; sentAt; to; messageId; /** e.g. which payment; never an amount */ detail?: string }
ASSET_ROLES: + 'finished_photo'
ClientRosterSubmission: + colours: string   // healed to ''
// mail.ts
export interface MailAttachment { filename: string; content: Buffer; contentType: string; cid?: string }
MailMessage: + attachments?: MailAttachment[]
```

- [ ] **Step 1: Extend the test**

Append to `tests/status/types.test.ts`:
```ts
import { PAYMENT_KINDS, PAYMENT_KIND_LABEL, ASSET_ROLES } from '@/lib/types';
import { healSubmission } from '@/lib/data/logic';
import type { ClientRosterSubmission } from '@/lib/types';

test('round two adds two stages, three payment kinds, the finished-photo role, and heals colours', () => {
  assert.equal(UPDATE_STAGES.length, 14);
  assert.equal(UPDATE_STAGE_LABEL.payment_received, 'Payment received');
  assert.equal(UPDATE_STAGE_LABEL.review_request, 'Review and referral');
  assert.deepEqual([...PAYMENT_KINDS], ['initial_deposit', 'production_deposit', 'final_payment']);
  assert.equal(PAYMENT_KIND_LABEL.production_deposit, 'pre-production deposit');
  assert.ok((ASSET_ROLES as readonly string[]).includes('finished_photo'));
  const s = { players: [] } as unknown as ClientRosterSubmission;
  assert.equal(healSubmission(s).colours, '');
});
```
(Adjust the existing "twelve stages" assertion to 14.)

- [ ] **Step 2: Run to see it fail** — `npm test 2>&1 | grep -E "types.test|fail"`.

- [ ] **Step 3: Implement**

`src/lib/types.ts`: add the two stages at the END of `UPDATE_STAGES`; add their labels; add `PAYMENT_KINDS`, `PaymentKind`, `PAYMENT_KIND_LABEL` right after `UPDATE_STAGE_LABEL`; add `detail?: string` to `CustomerEmailRecord` with the comment above; add `'finished_photo'` at the end of `ASSET_ROLES`; add `/** "Your colours", typed on the design page. */ colours: string;` to `ClientRosterSubmission` after `inspiration`.

`src/lib/data/logic.ts` `healSubmission`: add `s.colours ??= '';`.

`src/components/artwork-gallery.tsx`: `ROLE_LABELS` gains `finished_photo: 'Finished jerseys'`; `ROLE_ORDER` gains `'finished_photo'` last.

`src/lib/mail.ts`: add `MailAttachment`, the optional `attachments` field, and pass `attachments: m.attachments` into `transporter().sendMail({...})` (nodemailer accepts `{ filename, content, contentType, cid }`).

- [ ] **Step 4: Verify and commit**

`npx tsc --noEmit -p . && npm test` → all pass (tsc will flag any `Record<AssetRole, …>` or `Record<UpdateStage, …>` that needs the new members — fix each, e.g. `ROLE_LABELS`).
```bash
git add src/lib/types.ts src/lib/mail.ts src/lib/data/logic.ts src/components/artwork-gallery.tsx tests/status/types.test.ts
git commit -m "Round two types: payment kinds, two more stages, finished-photo role, colours, mail attachments

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Which emails are due, round two (pure)

**Files:** Modify `src/lib/data/customer-updates-logic.ts`; test `tests/status/due-updates.test.ts`.

**Interfaces produced:**
```ts
export interface DueUpdate { stage: UpdateStage; needsAmount: boolean; blocked: string | null; repeatable: boolean; paymentKind: PaymentKind | null }
export function defaultPaymentKind(status: OrderStatus): PaymentKind;
```
Rules:
- Drop the automatic offers of `initial_deposit_received` and `production_deposit_received`.
- `payment_received`: offered with `repeatable: true` and `paymentKind: defaultPaymentKind(status)` whenever `pos('waiting_for_deposit') <= pos(status) <= pos('shipped')`.
- `review_request`: offered once (not repeatable) when `status === 'completed'`.
- `defaultPaymentKind`: `waiting_for_deposit` or earlier → `initial_deposit`; `waiting_for_approval`, `waiting_for_production_deposit`, `in_production` → `production_deposit`; `waiting_for_final_approval` and later → `final_payment`.
- The once-only check: `if (!repeatable && sent.has(stage)) return;`.
- Everything else (design_talk, finalizing_details, three requests, proof_ready, approval_confirmed, in_production, shipped with tracking, completed, no-recipient blocking) unchanged.

- [ ] **Step 1: Tests.** In `tests/status/due-updates.test.ts`: change the "each status offers its own email, once" cases so that statuses now also carry `payment_received` where applicable — write the expectations explicitly:
```ts
test('payment received is offered from the initial deposit through shipped, repeatable, with a sensible default kind', () => {
  const at = (s: OrderStatus) => dueUpdates(order(s), []).find((d) => d.stage === 'payment_received');
  assert.equal(at('draft'), undefined);
  assert.equal(at('finalizing_details'), undefined);
  assert.equal(at('waiting_for_deposit')?.paymentKind, 'initial_deposit');
  assert.equal(at('waiting_for_approval')?.paymentKind, 'production_deposit');
  assert.equal(at('in_production')?.paymentKind, 'production_deposit');
  assert.equal(at('waiting_for_payment')?.paymentKind, 'final_payment');
  assert.equal(at('shipped')?.paymentKind, 'final_payment');
  assert.equal(at('completed'), undefined);
  const sentTwice = order('shipped', { trackingCode: 'x', customerEmails: [{ stage: 'payment_received', sentAt: 'x', to: 'sam@example.com', messageId: '' }] });
  assert.equal(dueUpdates(sentTwice, []).find((d) => d.stage === 'payment_received')?.repeatable, true);
});

test('the deposit-received follow-ups are no longer offered by status', () => {
  const past = [moved('design_talk', 'waiting_for_deposit'), moved('waiting_for_deposit', 'waiting_for_approval', '2026-09-22T10:00:00Z')];
  assert.ok(!stages(order('waiting_for_approval'), past).includes('initial_deposit_received'));
  const prod = [moved('waiting_for_approval', 'waiting_for_production_deposit'), moved('waiting_for_production_deposit', 'in_production', '2026-09-22T10:00:00Z')];
  assert.ok(!stages(order('in_production'), prod).includes('production_deposit_received'));
});

test('the review request is offered once, only on completed', () => {
  assert.ok(stages(order('completed')).includes('review_request'));
  assert.ok(!stages(order('shipped', { trackingCode: 'x' })).includes('review_request'));
  const sent = order('completed', { customerEmails: [{ stage: 'review_request', sentAt: 'x', to: 'sam@example.com', messageId: '' }] });
  assert.ok(!stages(sent).includes('review_request'));
});
```
Update the older tests: the "each status offers its own email" loop must filter out `payment_received` before comparing (`stages(...).filter((s) => s !== 'payment_received')`), and the deposit-received follow-up test from round one is replaced by the one above. Import `OrderStatus` if not already.

- [ ] **Step 2: Implement** the rules above; `offer()` takes `(stage, blocked = null, extra: { repeatable?: boolean; paymentKind?: PaymentKind | null } = {})` and pushes `{ stage, needsAmount: MONEY_STAGES.has(stage), blocked, repeatable: !!extra.repeatable, paymentKind: extra.paymentKind ?? null }`.

- [ ] **Step 3: Verify, commit** (`Customer updates: one repeatable payment-received email; review request after completion`).

---

### Task 3: The emails, round two (pure)

**Files:** Modify `src/lib/data/update-mail.ts`; test `tests/status/update-mail.test.ts`.

**Interfaces produced:**
```ts
export interface UpdateMailInput {
  teamName; firstName; rosterUrl; shareUrl;
  designUrl: string; detailsUrl: string;                 // the two stage pages
  amount; howToPay; estimatedFinishDate; trackingCode;
  paymentReceivedFirst: boolean;                         // shipped opener (unchanged)
  cameFromGate: boolean;                                 // in_production opener
  paymentKind: PaymentKind;                              // payment_received
  photos: Array<{ cid: string; name: string }>;          // final_payment_requested
  nextAfterApproval; approvedBy; googleReviewUrl; referralLine;
}
```
Copy (verbatim; `{team}`, `{first}`, `{amount}` substituted):
- `design_talk`: button → `designUrl`, label "Send logos and inspiration"; add a third line "Got team colours in mind? There's a spot for those too."
- `finalizing_details`: button → `detailsUrl`.
- `initial_deposit_requested`: muted → "Once it's received, you'll get a follow-up email confirming it."
- `production_deposit_requested`: line → "{team} is approved and ready for production. To start, we need the pre-production deposit, 50% of the order: {amount}."; muted → "Once it's received, you'll get a follow-up email confirming it, and production starts."
- `proof_ready`: lines → ["The {team} proof is ready. This sheet is exactly what our factory sees: the names, numbers and sizes on it are what gets printed.", "Check every line, then sign off. Once it's approved nothing changes, so look twice."]; muted → "Spot something wrong? Reach out to your sales representative, or to Keenan directly, before you approve."
- `in_production`: first line → cameFromGate ? "We received your payment, and {team} is in production.{estimate}" : "{team} is in production.{estimate}" (estimate as today).
- `final_payment_requested`: lines → ["{team} is finished and ready to ship. The final payment of {amount} releases it.", "Once it's received, you'll get your tracking number shortly after."]; when `photos.length`, the HTML shows a grid of `<img src="cid:{cid}" alt="{name}">` (two per row, `width="300"`, rounded) between the lines and the pay box, and the text gets a line "Photos of the finished jerseys are attached."
- `completed`: lines → ["It was a pleasure making them for {team}."]; button → rosterUrl dark "Your team's page"; muted unchanged; no review button, no referral line, no `button2`.
- NEW `payment_received`: subject "Payment received — {team}"; preheader "Got it, thanks. Here's what happens next."; headline "Got it, thanks {first}."; lines: ["We received your {PAYMENT_KIND_LABEL[paymentKind]} for {team}.", next] where next = initial_deposit → "Design work carries on, and you'll hear from Keenan with the next mockup."; production_deposit → "Production is next. You'll get a note when it starts."; final_payment → "Your tracking number follows shortly, as soon as it ships."; dark button rosterUrl "Your team's page"; hero false.
- NEW `review_request`: subject "How are the jerseys? — {team}"; preheader "A quick favour, if you have a minute."; headline "How are the {team} jerseys?"; lines: ["Now that they've had a few games, we'd love to hear how they're holding up.", googleReviewUrl ? "If you're happy with them, a short Google review helps the next team find us." : "", referralLine].filter(Boolean); button: googleReviewUrl ? { href: googleReviewUrl, label: 'Review us on Google' } : { href: rosterUrl, label: "Your team's page", dark: true }; muted "If anything isn't right, reply to this email and Keenan will sort it."; hero true.

- [ ] **Step 1: Tests.** Update `base` in `tests/status/update-mail.test.ts` with the new fields (`designUrl: 'https://x/roster/t/design'`, `detailsUrl: 'https://x/roster/t/details'`, `cameFromGate: false`, `paymentKind: 'final_payment'`, `photos: []`). Keep the existing tests (fix the completed test: it must now assert the review URL and referral line are ABSENT from `completed` and PRESENT in `review_request`). Add:
```ts
test('the two link emails point at their stage pages', () => {
  assert.ok(composeUpdateMail('design_talk', base).html.includes(base.designUrl));
  assert.ok(composeUpdateMail('finalizing_details', base).text.includes(base.detailsUrl));
});
test('payment received names the payment and what comes next, never an amount', () => {
  for (const [kind, next] of [['initial_deposit', /next mockup/], ['production_deposit', /Production is next/], ['final_payment', /tracking number/]] as const) {
    const m = composeUpdateMail('payment_received', { ...base, paymentKind: kind });
    assert.match(m.text, next);
    assert.ok(m.text.includes(PAYMENT_KIND_LABEL[kind]));
    assert.ok(!/\$\s?\d/.test(m.text));
  }
});
test('proof ready explains the factory sheet; in production opens with payment received after the gate', () => {
  assert.match(composeUpdateMail('proof_ready', base).text, /exactly what our factory sees/);
  assert.match(composeUpdateMail('proof_ready', base).text, /sales representative/);
  assert.match(composeUpdateMail('in_production', { ...base, cameFromGate: true }).text, /We received your payment/);
  assert.doesNotMatch(composeUpdateMail('in_production', base).text, /received your payment/);
});
test('final payment carries the photos and the tracking promise; pre-production says 50%', () => {
  const m = composeUpdateMail('final_payment_requested', { ...base, photos: [{ cid: 'photo-1', name: 'front.jpg' }, { cid: 'photo-2', name: 'back.jpg' }] });
  assert.ok(m.html.includes('cid:photo-1') && m.html.includes('cid:photo-2'));
  assert.match(m.text, /Photos of the finished jerseys are attached/);
  assert.match(m.text, /tracking number shortly after/);
  assert.doesNotMatch(composeUpdateMail('final_payment_requested', base).text, /attached/);
  assert.match(composeUpdateMail('production_deposit_requested', base).text, /50% of the order: \$250/);
});
```
(Import `PAYMENT_KIND_LABEL` from `@/lib/types`.) The money test's "no `$` outside the three request emails" must still pass for the two new stages.

- [ ] **Step 2: Implement** (photo grid built with `esc(name)` for alt text and `cid` values that are `[a-z0-9-]` only — the sender guarantees that).

- [ ] **Step 3: Verify, commit** (`Update emails: stage-page links, payment received, review request, factory-sheet copy, photos`).

---

### Task 4: Timeline links and the stage-page helpers (pure) + Timeline component

**Files:** Create `src/lib/data/stage-pages.ts`; modify `src/lib/data/timeline.ts`, `src/lib/data/logic.ts` (`rosterLinkView`, `publicViewOf`), `src/components/timeline.tsx`; tests `tests/status/timeline.test.ts` (extend) and `tests/status/stage-pages.test.ts`.

**Interfaces produced:**
```ts
// stage-pages.ts
export type StagePage = 'design' | 'details';
export const STAGE_SECTIONS: Record<StagePage, ClientLinkSections> = {
  design: { logos: true, inspiration: true, roster: false, personalDetails: false },
  details: { logos: false, inspiration: false, roster: true, personalDetails: true },
};
export const STAGE_PAGE_COPY: Record<StagePage, { title: string; intro: string }> = {
  design: { title: 'Send us your logos and inspiration', intro: "Your logo in any format, your colours, and pictures of looks you like. No logo yet is fine — tell us the idea and we'll draw it." },
  details: { title: 'Roster and contact details', intro: "Each player's name as it should print, their number, and jersey and sock sizes, plus who we contact and where the box ships." },
};
/** Relative paths, so the same helper serves pages and emails (emails prefix the base URL). */
export function stagePagePaths(token: string): Record<StagePage, string>;   // { design: `/roster/${token}/design`, details: `/roster/${token}/details` }
// timeline.ts
TimelineStep: + href: string | null; linkLabel: string | null;
export function timelineOf(order: TimelineInput, history: ChangeLogEntry[], opts: { designUrl?: string; detailsUrl?: string } = {}): TimelineStep[];
```
Rules: `designing` current → `href = opts.designUrl ?? null`, `linkLabel = 'Send logos and inspiration'`; `finalizing` current → `opts.detailsUrl`, `'Fill in roster and details'`; every other step `null`. `rosterLinkView` and `publicViewOf` call `timelineOf(o, history, stagePagePaths(o.rosterToken))`.

`src/components/timeline.tsx`: when `s.href`, render `<a href={s.href} className="mt-1 inline-block text-sm font-semibold text-ppc-gold hover:underline">{s.linkLabel} →</a>` after the copy. (The staff page's compact timeline shows the link too; it opens the customer page, which is fine.)

- [ ] **Step 1: Tests**
```ts
// tests/status/stage-pages.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_SECTIONS, stagePagePaths } from '@/lib/data/stage-pages';
test('stage pages ask for exactly their own sections and live under the token', () => {
  assert.deepEqual(STAGE_SECTIONS.design, { logos: true, inspiration: true, roster: false, personalDetails: false });
  assert.deepEqual(STAGE_SECTIONS.details, { logos: false, inspiration: false, roster: true, personalDetails: true });
  assert.deepEqual(stagePagePaths('abc'), { design: '/roster/abc/design', details: '/roster/abc/details' });
});
```
Append to `tests/status/timeline.test.ts`:
```ts
test('the designing and finalizing steps link to their pages only while current', () => {
  const opts = { designUrl: '/roster/t/design', detailsUrl: '/roster/t/details' };
  const designing = timelineOf(order('design_talk'), [], opts).find((s) => s.key === 'designing')!;
  assert.equal(designing.href, '/roster/t/design');
  assert.equal(designing.linkLabel, 'Send logos and inspiration');
  const finalizing = timelineOf(order('finalizing_details'), [], opts).find((s) => s.key === 'finalizing')!;
  assert.equal(finalizing.href, '/roster/t/details');
  assert.equal(timelineOf(order('in_production'), [], opts).find((s) => s.key === 'designing')!.href, null);
  assert.equal(timelineOf(order('design_talk'), []).find((s) => s.key === 'designing')!.href, null);
});
```
- [ ] **Step 2: Implement.** - [ ] **Step 3: Verify, commit** (`Timeline: the current design and details steps link to their pages`).

---

### Task 5: The two stage pages, the colours note, the submission pipeline

**Files:** Create `src/app/roster/[token]/design/page.tsx`, `src/app/roster/[token]/details/page.tsx`; modify `src/app/roster/[token]/page.tsx` (extract the shared loader), `src/app/roster/[token]/client-form.tsx`, `src/app/roster/[token]/actions.ts`, `src/lib/data/submission-logic.ts`, `src/lib/data/logic.ts` (`diffSubmissions`, `planAcceptance`), `src/components/submission-review.tsx`; tests `tests/intake/submission-colours.test.ts`.

**Interfaces:**
- `submitClientForm(token: string, payload: SubmitPayload, stage?: StagePage)`: sections = `stage ? STAGE_SECTIONS[stage] : link.sections`.
- `SubmitPayload.colours?: string`; `CleanSubmission.colours: string` (trimmed, max 500 chars, kept only when `sections.logos || sections.inspiration`, else `''`).
- `ClientForm` new optional props: `stage?: StagePage | null` (passed to the action) and nothing else; the colours block renders when `sections.logos || sections.inspiration`.

- [ ] **Step 1: Tests** (`tests/intake/submission-colours.test.ts`): `cleanSubmission` keeps a trimmed `colours` when the inspiration section is asked and drops it otherwise; `diffSubmissions` reports a change line `{ section: 'inspiration', label: 'Colours', from, to }` when colours change, and reports NO logo/inspiration lines when the new submission's `sections` do not include them (a details-page submission after a design-page one). Look at the existing `diffSubmissions` code to write these against its real shape (`SubmissionChange` in `src/lib/types.ts`).

- [ ] **Step 2: Pipeline.** `submission-logic.ts`: add `colours` to `SubmitPayload`, `CleanSubmission`, and `cleanSubmission`. `logic.ts` `diffSubmissions`: guard the logos comparison with `next.sections.logos`, the inspiration comparison with `next.sections.inspiration`, the players/roster comparisons with `next.sections.roster`, the contact comparison with `next.sections.personalDetails`; add the colours line. `planAcceptance`: when `s.colours` is non-empty and `order.designReferenceNotes` does not already contain it, set `orderPatch.designReferenceNotes = [order.designReferenceNotes, `Team colours: ${s.colours}`].filter(Boolean).join('\n')`.

- [ ] **Step 3: The form.** In `client-form.tsx`: add `colours` state seeded from `previous?.colours ?? ''` (add `colours?: string` to `PreviousSubmission` and map it on the pages); after the inspiration `Step` (or after logos when inspiration is off) render, inside the same design flow and NOT numbered:
```tsx
{(sections.logos || sections.inspiration) && (
  <details className="rounded-xl border border-line bg-surface">
    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ppc-gold">Add your colours (optional)</summary>
    <div className="border-t border-line p-4">
      <p className="text-xs text-muted">Team colours, or a look to match. "Navy and gold, like our old set" is plenty.</p>
      <textarea className="mt-2 w-full" rows={2} value={colours} onChange={(e) => setColours(e.target.value)} maxLength={500} />
    </div>
  </details>
)}
```
Include `colours` in the submit payload; pass `stage` to `submitClientForm(token, payload, stage ?? undefined)`.

- [ ] **Step 4: The pages.** Move the hub page's loading (link, previous submission, previews) into a helper `loadClientPage(token)` in `src/app/roster/[token]/load.ts` returning `{ link, previous, previousPreviews }` or `null`, and use it from all three pages. Each stage page: `notFound()` when null; header block with `STAGE_PAGE_COPY[stage].title` as the `<h1>` and `.intro` under it, a small link "← Your team's page" to `/roster/<token>`; then the same three-state block as the hub (locked / not enabled / form) with `sections={STAGE_SECTIONS[stage]}` and `stage={stage}`. No timeline on the stage pages, no approval block.

- [ ] **Step 5: Review.** `submission-review.tsx`: after the contact block, `{s.colours && <p className="text-sm"><span className="text-muted">Colours:</span> {s.colours}</p>}`.

- [ ] **Step 6: Look at it** against the JSON store (see Global Constraints): open a seeded order's `/roster/<token>/design`, expand the colours box, type, submit; open the staff order page and see the submission with the colours line; open `/details`, confirm only roster and contact show. Stop the server.

- [ ] **Step 7: Verify, commit** (`Customer stage pages: design (with colours) and details`).

---

### Task 6: The sender, round two

**Files:** Modify `src/lib/customer-updates.ts`, `src/app/orders/[id]/update-actions.ts`.

**Interfaces:**
```ts
export interface SendUpdateOptions { amount?: string; howToPay?: string; force?: boolean; paymentKind?: PaymentKind }
export function mailInputFor(order, history, settings, base, opts): UpdateMailInput   // now also designUrl/detailsUrl (base + stagePagePaths), cameFromGate, paymentKind, photos
export async function sendCustomerUpdate(orderId, stage, opts, actor)
```
Rules:
- `cameFromGate`: the most recent `status_changed` entry has `fromValue === 'waiting_for_production_deposit'` and `toValue === order.status`.
- `paymentKind`: `opts.paymentKind ?? defaultPaymentKind(order.status)`.
- `photos` for `final_payment_requested`: the bundle's assets with `role === 'finished_photo'`, ordered by `slot`, first 8, mapped to `{ cid: `photo-${n + 1}`, name: displayName || fileName }`. Elsewhere `[]`.
- Attachments: for `final_payment_requested`, download each chosen photo (`resolveFileUrl(asset.fileUrl)` then `fetch`), skip any over 6 MB or that fails (log `[updates] photo skipped …`), and pass `attachments: [{ filename: name, content: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'image/jpeg', cid }]` to `sendMail`. The `photos` list handed to the composer must match the attachments that were actually built (drop skipped ones before composing).
- Repeatable stages: the once-only check reads `due.repeatable`; a repeatable stage is offered even if sent.
- The record for `payment_received` carries `detail: PAYMENT_KIND_LABEL[paymentKind]`.
- `sendUpdateAction(orderId, stage, { amount?, howToPay?, force?, paymentKind? })` validates `paymentKind` against `PAYMENT_KINDS` when present.

- [ ] Implement, `npx tsc`, `npm test`, commit (`Customer updates: payment kind, stage-page links, photos attached to the final payment email`).

---

### Task 7: The staff panel, round two

**Files:** Create `src/components/finished-photos.tsx`; modify `src/components/send-update-panel.tsx`, `src/app/orders/[id]/page.tsx`.

- `FinishedPhotos` (client): props `{ orderId: string; photos: ViewableAsset[] }`. Renders thumbnails (`viewUrl`) with a remove button calling `detachAsset(assetId, orderId)` (exists in `src/app/orders/actions.ts`), and an "Add photos" `<input type="file" multiple accept="image/*">` that uploads each file with the same three-step flow as `uploadFile` in `src/components/order-form/assets.tsx` (copy that function into the new component, or export it from `assets.tsx` and import it), then calls `attachAsset({ orderId, role: 'finished_photo', slot: nextSlot, fileUrl, fileName, displayName: fileName, notes: '' })`. Cap at 8; show "n of 8". Uses `useRouter().refresh()` after changes so the server page re-renders.
- Panel props gain `finishedPhotos: ViewableAsset[]` and `showPhotos: boolean` (true from `waiting_for_final_approval` onward). Inside the `final_payment_requested` card, above Send: `<FinishedPhotos …/>` and a line "{n} photo(s) will be attached." When `showPhotos` but the final-payment card is not due (e.g. status `waiting_for_final_approval`), render `FinishedPhotos` in its own small card titled "Finished jersey photos" so Keenan can upload before the stage arrives.
- `payment_received` card: rendered after the due cards, quieter style (`border-line` instead of gold), title "Payment received? Tell the customer.", a `<select>` of the three kinds labelled with `PAYMENT_KIND_LABEL` values (capitalised), defaulting to `d.paymentKind`, Send with `paymentKind`. Because it is repeatable it never disappears; the sent list shows `detail` after the label ("Payment received · final payment").
- `review_request` card: standard gold card with the hint line "Best sent a week or two after delivery, once the jerseys have been worn."
- Page: pass `finishedPhotos={assets.filter((a) => a.role === 'finished_photo')}` (the page already signs `assets`) and `showPhotos={STATUS_META[order.status].order >= STATUS_META.waiting_for_final_approval.order}`. The artwork gallery on the staff page should hide `finished_photo` from the artwork section (`hideRoles={['font', 'finished_photo']}`) since the panel shows them; the customer's `/share` gallery keeps them (they render under "Finished jerseys").

- [ ] Try it against the JSON store (uploads go through `/api/upload` locally), then `npx tsc`, `npm test`, lint, commit (`Order page: payment-received and review cards, finished-jersey photos`).

---

### Task 8: Deploy and walk through (controller)

Merge to main, push, confirm the deployment, then on a test order: open both stage pages from the emails, submit colours, press Payment received for each kind, upload two photos and send the final payment email (check the attachments in the mailbox), send the review request, and delete the test order.
