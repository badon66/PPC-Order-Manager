# Customer order status: timeline on the team's page, and an email per stage

Design agreed with Keenan on 2026-09-24/25. Builds on the website intake
(`2026-09-20-website-intake-design.md`) and the confirmation email that now
sends from `src/lib/data/intake-mail.ts`.

## Goal

A team that has ordered can see where their order is without asking, and gets a
short email from Keenan's mailbox each time it moves. Fewer "did the deposit go
through?", "did my approval register?", "has it shipped?" emails; every one of
those is a touchpoint that carries the brand instead of costing Keenan a reply.

## Decisions Keenan made

- Every status the manager has is a step on the customer's timeline.
- Emails ask Keenan before sending ("Ask me each time"), except the approval
  receipt, which is a reply to the customer's own click.
- The timeline shows on the team's page (`/roster/<token>`), on the read-only
  order sheet (`/share/<token>`) and, with the send controls, on the staff
  order page (`/orders/<id>`).
- In production carries a note: "We don't usually hear from production until
  the jerseys are done. If they send us anything in between, Keenan will pass
  it along."
- Money: the three request emails carry an amount Keenan types at the moment
  of sending, and that is the only place money appears. See "The money rule".
- Approval moves the order into production automatically (or into the
  pre-production deposit gate if that deposit is still outstanding).
- Completed sends a "review us on Google, refer a team" email.

## The twelve statuses, and what each one gets

`ORDER_STATUSES` as of commit 825499e, in the manager's own order. "Prompt"
means the send panel on the staff order page (see below). "Moving past" means
Keenan sets any later status.

| Status | Customer's timeline step | Email | Prompt asks for |
|---|---|---|---|
| incomplete | Enquiry received | none | — |
| draft | Enquiry received | none, the website confirmation covered it | — |
| design_talk | Designing your jerseys | **Send us your logos and inspiration**: link to the team's page with the logo and inspiration sections open | nothing; sending turns those two sections on |
| finalizing_details | Finalizing details | **Roster and contact details**: link to the team's page with the roster and personal-details sections open | nothing; sending turns those two sections on |
| waiting_for_deposit | Initial deposit | **Initial deposit requested**: amount, "to keep the design work moving; it comes off your total", how to pay | the amount |
| moving past waiting_for_deposit | Initial deposit received (date) | **Deposit received, thanks** | nothing |
| waiting_for_approval | Proof ready to approve (approve button on the page) | **Your proof is ready to approve** with the button | nothing |
| customer or staff signs | Approved (who, when) | **Approval confirmed**, automatic | — |
| waiting_for_production_deposit | Pre-production deposit | **Deposit due before production**: amount, how to pay | the amount |
| moving past it | Deposit received (date) | **Deposit received, production is next** | nothing |
| in_production | In production, estimated finish, the production note | **Your jerseys are in production**: same note and date | nothing |
| waiting_for_final_approval | Final check: photos on their way | none, Keenan sends the photos himself | — |
| waiting_for_payment ("Final Payment Due") | Final payment | **Final payment due**: amount, how to pay | the amount |
| shipped, once `trackingCode` is filled in | Shipped, tracking number | **Your jerseys have shipped** with tracking. When the previous status was Final Payment Due it opens with "Payment received, thank you", so Keenan gets one prompt, not two | nothing |
| completed | Delivered | **Thanks from Powerplay**: Google review button, "know another team?" referral line | nothing |

Rules that apply to all of them:

- One send per stage per order. A Resend link on the order's history page
  sends again and records it again.
- Recipient: `contactEmail`, else the enquiry's `email`. Neither: the panel says
  "no customer email on this order" and links to the contact section instead of
  offering Send.
- Shipped is only offered once `trackingCode` is non-empty.
- Proof ready is not offered if the order is already approved.
- Every send is written to the change log (`customer_emailed`, with the stage,
  recipient and message id) so the history page shows it next to the status
  change that caused it.
- Nothing is sent when SMTP is not configured; the panel says so.

## The customer's timeline

A vertical list. Done steps ticked, the current step gold with its one-line
copy and detail, future steps grey. Steps are derived, never stored:

- The list of steps is fixed, in status order. **Initial deposit appears only
  if the order has ever been in `waiting_for_deposit`** (from the change log),
  so a normal order shows ten steps and a security-deposit order eleven.
- Dates come from the change log's `status_changed` entries (`at`), the
  approval record (`signedAt`), `estimatedFinishDate` and `productionFinishDate`.
- The money steps never show an amount. The amount lives in the request
  email only (see "The money rule").

Copy per step, when current:

| Step | Copy |
|---|---|
| Enquiry received | We've got your enquiry. Keenan will be in touch. |
| Designing your jerseys | Keenan is working on your design. Logos and inspiration go here. |
| Finalizing details | Roster, sizes and shipping details. Fill them in here when you're ready. |
| Initial deposit | Waiting on your initial deposit. / Initial deposit received. |
| Proof approval | Your proof is ready to approve. / Approved by {name} on {date}. |
| Pre-production deposit | Waiting on the pre-production deposit. / Deposit received. |
| In production | Your jerseys are being made. Estimated finish {date}. {production note} |
| Final check | Photos of the finished jerseys are on their way to you. |
| Final payment | Waiting on the final payment. / Paid, thank you. |
| Shipped | On its way. Tracking: {code}. |
| Delivered | Enjoy the jerseys. |

Placement: top of `/roster/<token>` above the form; top of `/share/<token>`
above the status badge (which it replaces); on `/orders/<id>` in the
Operational section, with the send panel beside it.

## The send panel (staff)

On `/orders/<id>`, under the status dropdown. Shown when the current status has
an email that has not been sent for this order (or when a "moving past" email is
due). Contents: the stage name, the recipient, subject line, a preview of the
email body, the amount field for the three money stages (required, free text
such as "$200"), the editable "how to pay" text prefilled from Settings, and
two buttons: **Send** and **Not now**. Not now collapses it to a one-line chip
("Deposit received email not sent · Send") that stays until sent or until the
order moves past that stage. It is a panel, not a modal: nothing blocks the page.
When one status change makes two emails due at once (Deposit received and Proof
ready, say), the panel lists both, each with its own Send.

Design Talk and Finalizing Details sends also switch on the matching
`ClientLinkSections` so the link in the email opens a page with those sections
visible.

## Approval moves the order on

`approveOrder` (customer via `/share` or `/roster`, or staff on the sheet)
currently records the signature and leaves the status alone. New behaviour,
after the record is saved:

- If the pre-production deposit has been received (the order has moved past
  `waiting_for_production_deposit` at any point, per the change log) →
  status becomes `in_production`, logged as a status change by "approval".
- Otherwise → status becomes `waiting_for_production_deposit`.
- If the order is already at or beyond `in_production`, nothing changes.

The approval receipt email goes out automatically in the same action. The
resulting stage's prompt (In production, or Deposit due) then waits for Keenan
on the order page like any other.

## Settings

The manager has no general settings store, only per-list sales settings. Add a
small one: `AppSettings` in the data layer (Supabase table `app_settings`, one
row; JSON store `settings` key) with three text fields, edited on a new
`/settings` page reachable from the staff nav:

- `howToPay`: the line prefilled into the three money emails.
- `googleReviewUrl`: the review button target in the Completed email. Empty
  hides the button and the panel says so.
- `referralLine`: the referral sentence in the Completed email, e.g. "Know a
  team that needs jerseys? Send them our way and we'll thank you for it."
  Empty hides the line.

## Data and code

- `Order.customerEmails: CustomerEmailRecord[]` — `{ stage, sentAt, to,
  messageId }`. No amount. Added to the type, `blankOrder()`, `healOrder()`;
  not on the form's `EDITABLE` list (written only by the send action). No
  migration: orders are stored whole in `data jsonb`.
- `ChangeLogEntry.action` gains `'customer_emailed'`.
- `src/lib/data/timeline.ts` — `timelineOf(order, history, now)`: pure, returns
  the steps with state, copy, date and detail. Also `dueEmail(order, history)`:
  which email, if any, the panel should offer.
- `src/lib/data/mail-layout.ts` — the header, hero (optional), button and
  footer pulled out of `intake-mail.ts` so the confirmation and every update
  share one layout. `intake-mail.ts` is refactored onto it, output unchanged
  (its tests must still pass).
- `src/lib/data/update-mail.ts` — `composeUpdateMail(stage, view)`: pure,
  subject/text/html for each of the twelve emails. Escapes everything the customer
  or Keenan typed. No prices except the typed amount on the three money emails.
- `src/lib/customer-updates.ts` — `sendCustomerUpdate(orderId, stage, input,
  actor)`: composes, sends via `sendMail`, appends the record, writes the log,
  flips sections for the two link emails. Best effort like the confirmation:
  a failed send is a log line and the panel shows the failure reason.
- Server actions on `/orders/[id]` for Send and Resend; `approveOrder` gains the
  status move and the automatic receipt.
- `src/components/timeline.tsx` (audience `customer` | `staff`) and
  `src/components/send-update-panel.tsx`.
- `rosterLinkView` and `publicViewOf` gain `timeline` (computed server-side
  from history, so the public pages never see the raw log).

## The money rule

CLAUDE.md: "No pricing, money, or invoicing anywhere. Not a dollar field, not a
total, not a 'helpful' cost estimate." The rule stands. The one exception,
decided by Keenan on 2026-09-25: the three request emails (initial deposit,
pre-production deposit, final payment) carry an amount he types into the send
panel, editable each time. That amount goes into that email and nowhere else.
It is not stored on the order, not shown on the timeline, not written to the
change log, not on any form. The panel field is free text ("$200"), and the app
does not parse or add anything up. CLAUDE.md gets one sentence recording this.

## Out of scope

Carrier lookups or live tracking, text messages, photo uploads for the final
check, referral tracking or payouts, editing an email's wording per order
beyond the amount and the how-to-pay line.

## Testing

Unit (node:test, in `tests/status/`):

- `timelineOf` for every status, with and without the initial-deposit detour,
  with and without approval, with dates from a synthetic change log.
- `dueEmail`: once only, Shipped needs tracking, Proof ready skipped when
  approved, the Final-Payment-then-Shipped fold, nothing without a recipient.
- `composeUpdateMail` for all twelve emails: subject, link, amount present only on
  money stages, escaping, the production note, no `$` outside the typed amount.
- `approveOrder` status move: deposit received → in_production; not received →
  waiting_for_production_deposit; already in production → unchanged.
- `intake-mail` tests unchanged after the layout refactor.

Live: deploy, create a test order with info@powerplaycustoms.ca as the customer,
walk it through all twelve statuses, send every email, read each one in the
mailbox, approve from the team's page and confirm the automatic move and
receipt. Then delete the test order.

## Rollout

One branch, one deploy. Existing orders get a timeline immediately from their
history; none of them get emails until Keenan presses Send.
