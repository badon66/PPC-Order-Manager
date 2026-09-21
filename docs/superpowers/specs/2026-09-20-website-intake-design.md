# Website intake — design

**Date:** 2026-09-20
**Status:** approach chosen by Keenan ("Draft order with upload link"); on the same evening he added that
each route must get its own page on orders.powerplaycustoms.ca and invited a third route. Spec awaiting his review
**Companion:** the website side lives in `K:\PP Customs\Website\docs\superpowers\specs\2026-09-20-contact-only-ordering-design.md` (the page that sends the enquiry)

## Why

Every sale starts with the enquiry form on powerplaycustoms.ca. Today that form only emails
Keenan; he then creates the order here by hand, switches on its client link and pastes the link
into his reply. The website page has no way to take artwork, and the manager has no way to
receive an order from anywhere but its own form.

This connects the two: an enquiry on the website creates a Draft order here, with the client link
already on, and the customer is handed that link the moment they press send.

## What we are building

### The flow

**Customer:** fills in the order page on the website, presses *Send to our team*. The page hands
the enquiry to the manager first (four-second budget), then submits to Shopify as it does today.
The "Got it. We're on it." panel gains one button — **Upload your logos and inspiration now →** —
which is their own `/roster/<token>` link. If the manager did not answer in time, the panel is
exactly what it is today and nothing is lost.

**Keenan:** gets the same Shopify email as now, plus two lines at the bottom: `Order manager:
https://orders.powerplaycustoms.ca/orders/<id>` and `Upload link: https://orders.powerplaycustoms.ca/roster/<token>`.
In the manager, the order list shows the new Draft with a **Website** badge; the order detail
page shows a **Website enquiry** card with what the team wrote, word for word. He promotes it by
changing its status, as with any quote he typed himself. Drafts are in the unfinalized bucket,
hidden from the default list, so tyre-kickers never sit among live jobs.

### The endpoint

`POST /api/intake` — JSON in, JSON out, no session. Lives in `src/app/api/intake/route.ts`; the
rules live in `src/lib/data/intake-logic.ts` (pure, tested) and the write goes through
`repo.createOrder` / `repo.updateOrder` like every other mutation.

Request body (all strings, all optional except the three marked required; anything else is
ignored):

| Field | Required | Goes to |
|---|---|---|
| `startingPoint` | yes — `Design ready`, `Starting from scratch` or `Ordered before` | `enquiry.startingPoint` |
| `customerName` | yes | `contactFirstName` / `contactLastName` (split on the first space) |
| `email` | yes, must look like an email | `contactEmail` |
| `teamName` | yes | `teamName` |
| `phone` | | `contactPhone` |
| `league` | | `enquiry.league` |
| `quantity` | | `enquiry.quantity` (free text — "18 players + 2 goalies") |
| `timeline` | | `enquiry.timeline` |
| `jerseyStyle` | | `jerseyTier` + `jerseyType` when it names a tier (Lite → lite/sublimated, Premier → premier/sublimated, Elite → elite/embroidered, Pro → pro/embroidered, Reversible → reversible/reversible_sublimated); otherwise `enquiry.jerseyStyle` only |
| `items` | | `enquiry.items` — any of `Jerseys`, `Socks`, `Pant shells` |
| `artworkStatus` | | `enquiry.artworkStatus` |
| `colours` | | `enquiry.colours` |
| `inspiration` | | `enquiry.inspiration` |
| `extraDetails` | | `enquiry.extraDetails` |
| `previousOrder` | | `enquiry.previousOrder` (reorder route only) |
| `website` | must be empty | honeypot: any value → `200 {ok:true}` with nothing created |

The new `Order.enquiry` object (`WebsiteEnquiry | null`, default `null`) keeps the raw words so
nothing the customer typed is lost to a mapping. `Order.source` is `'manual' | 'website'`,
default `'manual'`; `healOrder` fills both defaults for existing rows.

What the endpoint sets on the Draft it creates:

- `status: 'draft'`, `source: 'website'`, `enquiry: {…, receivedAt}`
- `requestClientDetails: true`, and `clientLinkSections` chosen by route (table below). Keenan flips any of the four on the order later and the same link updates.
- `specialNotes` untouched (the enquiry card is where the words live).
- Actor for the change log: `{ email: 'website@powerplaycustoms.ca', name: 'Website enquiry' }`, entry text "Created from the website enquiry form".

Response: `200 { ok: true, orderId, rosterUrl, managerUrl }`. Validation failure:
`400 { ok: false, error }`. Origin not allowed: `403`. Rate limited: `429`.

### Three routes, three pages

The website offers three starting points, and the customer's page on orders.powerplaycustoms.ca
is built for the one they chose. Same URL shape (`/roster/<token>`), same code path, but the
intro, the section set and the section blurbs come from the route. The route is stored as
`enquiry.startingPoint`; `rosterLinkView` gains a `variant` (`'ready' | 'scratch' | 'reorder' | null`)
and the page's copy is keyed on it. `null` (an order Keenan made by hand) keeps today's wording.

| Route (website card) | `startingPoint` | Sections on | The page opens with |
|---|---|---|---|
| We've got our design | `Design ready` | logos ✓ inspiration ✓ roster ✗ details ✗ | **Send us your design files.** "Logos, crest, any artwork you have — vector or the highest resolution you've got. Anything you'd like us to match goes under inspiration. Mockup back today." |
| We're starting from scratch | `Starting from scratch` | logos ✓ inspiration ✓ roster ✗ details ✗ | **Show us what you like.** "Any logo you already have goes first. Then pictures of looks you like — other jerseys, colour combos — and a line on what you like about each. We build the design from these." |
| We've ordered before | `Ordered before` | logos ✗ inspiration ✗ roster ✓ details ✓ | **Same design, new season.** "Tell us who's getting what — names as printed, numbers, sizes — and check the shipping details. Leave anything you don't know yet; you can come back to this link." |

The third route is my addition, on Keenan's invitation: returning teams are the easiest sale
and the one the two original cards fit worst (no artwork to send, and the roster is the whole
job). Its Draft also carries `enquiry.previousOrder` (free text: "Ice Cats 2025", an invoice
number, whatever they remember) so Keenan can find the earlier order and copy the design across.

Section blurbs under each heading change with the variant too — the logos blurb on the
scratch route says "if you have one", on the ready route it asks for vector files. The
roster and personal-details sections keep their current wording.

### Guards

- **Origin allow-list.** `INTAKE_ALLOWED_ORIGINS` env var, default
  `https://www.powerplaycustoms.ca,https://powerplaycustoms.ca`. `OPTIONS` answers the CORS
  preflight for those origins only; a `POST` from anywhere else is `403`. Same-origin posts (no
  `Origin` header) are also refused — this endpoint is only for the website.
- **Honeypot** field `website` (rendered hidden on the page). Filled → pretend success, write nothing.
- **Size and shape.** Body over 16 KB → `413`. Each field trimmed and capped at 2,000 characters; `email` must match a plain email pattern.
- **Rate limit.** Ten intakes per IP per ten minutes, in-memory token bucket per server instance (best effort; Vercel may run several). Enough to stop a loop, not a security boundary.
- **Dedupe.** Same `email` + `teamName` (case-insensitive, trimmed) as a **Draft** with `source: 'website'` created in the last 24 hours → update that Draft's `enquiry` and give it the newly generated roster token (the newest link the customer holds is the one that works), log it under the website actor, and return its links. Nothing else about the order is overwritten. A Draft Keenan has already promoted is left alone and a new Draft is made.

### In the manager UI

- Order list: a small **Website** badge next to the status for `source === 'website'`.
- Order detail (`/orders/[id]`): a **Website enquiry** card under the header, listing every
  non-empty `enquiry` field with its label, plus "Received <date>". Internal only — it is not
  added to `PublicOrderView`, so the share page never shows it.
- Order edit: nothing new. The mapped fields (team, contact, tier) appear in their normal places.

### The website side

One change to `changes/2026-09-20-contact-only/start-your-order.html` in the Website repo:

- The submit listener (already there for dropping empty fields) does not wait for the manager.
  Shopify's form protection only completes a submission that started from a real click, so the
  page cannot pause the submit for a network call. Instead the page **generates the roster token
  itself** (64 hex characters from `crypto.getRandomValues`), sends it in the intake body with a
  `keepalive` fetch that survives the navigation, writes the token into `return_to`
  (`/pages/<handle>?sent=1&roster=<token>`) and into two hidden fields, `contact[Upload link]`
  and `contact[Order manager]`, and lets the native submit go. The manager creates the Draft with
  that token (validated as 64 hex, refused with 409 if another order already holds it).
- The success panel asks `GET /api/intake/<token>` whether the Draft exists (up to four tries,
  two seconds apart) and only then shows the upload button. If the manager never answers, the
  panel is what it is today.
- `contact[Order manager]` is the order list searched for the team
  (`/orders?search=<team>`), because the order id is minted by the manager after the email is
  already on its way.
- The success panel reads `roster` from the URL and, when present, shows the upload button under
  the existing text. Without it, the panel is unchanged.
- No-JavaScript visitors: the Shopify submit works exactly as today; no intake, no link. Keenan
  creates the order by hand for those, as now.
- A hidden `website` honeypot input in both forms.

## Success criteria

1. A real submission from the live page creates one Draft order here with the team, contact,
   tier and the enquiry card filled from what was typed, and a change-log entry naming the website.
2. The success panel on the website shows the upload button, the link opens the customer page
   for that Draft in the variant matching the route (ready: files; scratch: inspiration; reorder:
   roster and details), and an uploaded logo or a submitted roster lands on that order.
3. Keenan's Shopify email carries the manager link and the upload link.
4. Submitting the same team + email again within a day updates the Draft rather than creating a second one.
5. A `POST` from a browser on another origin gets `403`; a filled honeypot creates nothing.
6. With the manager unreachable (fetch aborted), the page still submits to Shopify and the email arrives.
7. `npm test` passes with new tests for the mapping, the tier lookup, the dedupe key, the honeypot and the origin check; `npm run build` passes; the share page for a website-created order shows no enquiry text.

## Out of scope

- Email sending from the manager (Shopify's email covers it).
- A separate Enquiries inbox (Keenan chose Drafts).
- A fourth route. Three is the most the chooser can carry on a phone without scrolling past it.
- Moving the intake page itself onto the manager (a possible phase two).
- Roster or personal-details sections on by default for website leads.

## Risks

- **Spam Drafts.** Bounded by the guards above and by Drafts being hidden from the default list; the fix for a bad day is deleting them, which the manager already supports.
- **Two writers of the same enquiry** (dedupe window) — handled by updating in place; nothing on the order outside `enquiry` is touched.
- **The roster token appears in the website URL and the email.** It is the same capability link the customer is meant to hold; nothing new is exposed.
- **Vercel cold starts** can push the intake past four seconds on the first request of a quiet day. The page then falls back to the plain email; the Draft may still be created a moment later, without the customer having seen the link — Keenan's email will still carry it if the intake finished before the Shopify post, otherwise he pastes it as today.
