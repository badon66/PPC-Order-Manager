# Customer order status, round two: stage pages, a payment button, photos

Keenan's refinements of 2026-09-26 to the feature that went live on 2026-09-25
(`2026-09-25-customer-order-status-design.md`). Decisions he delegated are
marked *(decided)*.

## Stage pages for the customer

Two pages under the team's token, each a focused version of the existing
client form, linked from the matching email and from the timeline step while
it is current:

- `/roster/<token>/design` — "Send us your logos and inspiration". Logos and
  inspiration sections only, plus **Your colours**: a click-to-expand,
  optional text box ("navy and gold, like our old set") saved on the
  submission as `colours` and shown to Keenan in the submission review; on
  acceptance it is appended to the order's design-reference notes *(decided:
  text, not an upload; colour photos belong under inspiration)*.
- `/roster/<token>/details` — "Roster and contact details". Roster and
  personal-details sections only.

The hub `/roster/<token>` is unchanged apart from the timeline's Designing and
Finalizing steps carrying a link to the matching page while current. A stage
page's submit keeps only its own sections; a revisit prefills from the latest
submission as today. Both pages respect the link's on/off switch and the
production lock.

## One "Payment received" button, for any payment

The status-driven "deposit received" cards are gone. Instead the staff order
page always offers **Payment received? Tell the customer** from the initial
deposit stage through Shipped, with a choice of which payment (initial
deposit, pre-production deposit, final payment; defaulted from the status).
It can be sent more than once. The email says which payment arrived and what
comes next: design work carries on / production is next / the tracking number
follows shortly. No amounts.

Moving the order to In Production sends the In production email, which opens
with "We received your payment" when the order came from the pre-production
gate.

## Copy changes

- Initial deposit: closes with "Once it's received, you'll get a follow-up
  email confirming it."
- Pre-production deposit: "To start, we need the pre-production deposit, 50%
  of the order: {amount}." Same how-to-pay box (e-transfer, or card with a 3%
  processing fee). Closes with the same "once received" line and that
  production starts then.
- Proof ready: "This sheet is exactly what our factory sees: the names,
  numbers and sizes on it are what gets printed. Check every line, then sign
  off. Once it's approved nothing changes, so look twice." Closing line:
  "Spot something wrong? Reach out to your sales representative, or to Keenan
  directly, before you approve."
- Final payment ("The jerseys are done"): carries the finished-jersey photos
  Keenan uploaded (see below) and says "Once it's received, you'll get your
  tracking number shortly after."
- Completed: a short thank-you only *(decided)*. The review and referral ask
  moves to its own email, **Review and referral**, offered as a card from
  Completed onward with the hint "best sent a week or two after delivery",
  and sent when Keenan presses it. Rationale: a thank-you that asks for
  something reads as an ask; a note a fortnight later, once the jerseys have
  been worn, gets the review.

## Finished-jersey photos

A new asset role, `finished_photo`. On the staff order page, from Final check
onward, the panel shows a **Finished jersey photos** uploader (same upload
path as artwork, up to 8 photos). The Final payment email attaches them and
shows them inline; the order sheet shows them under "Finished jerseys". Files
over 6 MB are skipped with a log line rather than failing the send.

## Not changed

The money rule and its one exception; the approval auto-move; Settings; the
twelve-stage timeline shape (the deposit "received" steps remain on the
timeline, driven by status as before).
