# Website Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An enquiry sent from the website's order page creates a Draft order in this manager with its client link switched on and shaped for the route the customer chose, and the customer is shown that link the moment they press send.

**Architecture:** One public API route (`/api/intake`) accepts a JSON enquiry from the website origin, validates it with pure functions in `intake-logic.ts`, and writes through the existing `Repository` (`createOrder` / `updateOrder`), so both storage backends and the change log behave as they do for every other write. The website page generates the roster token itself and fires the intake with a `keepalive` fetch at the instant of the real submit, so Shopify's form protection keeps working and nothing waits on the manager; the success panel then asks `/api/intake/<token>` whether the Draft exists before it shows the upload button. The customer page (`/roster/[token]`) gains a `variant` derived from the stored route and swaps its intro and hints accordingly.

**Tech Stack:** Next.js 16 App Router (`src/`), TypeScript, Tailwind v4, Supabase JSONB store (and the JSON file store locally), `node --test` unit tests via tsx, Vercel deploy on `git push`. Website side: plain HTML/JS in a Shopify page (`K:\PP Customs\Website\changes\2026-09-20-contact-only\start-your-order.html`).

**Spec:** `docs/superpowers/specs/2026-09-20-website-intake-design.md`. Three deviations from it, made while planning against the code, are recorded in Task 1 and folded into the spec there.

## Global Constraints

- No pricing, money or invoicing anywhere in the manager. The enquiry carries none.
- Dates: `receivedAt` is an ISO timestamp (an instant, not a calendar date), so it may be formatted with `Date`; never touch `datePaid`/`estimatedFinishDate` here.
- Public pages are built field-by-field: `enquiry` is **not** added to `PublicOrderView` / `publicViewOf`.
- Business rules live in `src/lib/data/*-logic.ts`, not in a store; both stores keep working unchanged except for the new field defaults in `healOrder`.
- `healOrder` gets a line for every new non-optional Order field (`source`, `enquiry`).
- The access code never reaches the browser; the new routes are public by token/origin, like `/api/public-upload/`.
- Website copy rules: brand "Powerplay Customs"; the four claims only; no prices; contact `info@powerplaycustoms.ca` / `+1 (403) 895-9915`.
- Every live change on the website gets a CHANGELOG.md row with an undo (`K:\PP Customs\Website`); insert rows with a function replacement from a scratchpad file, never a `$`-bearing replacement string.
- Do not push the manager until Task 6 says so; `git push` is the deploy.
- Field names on the website form are fixed: `contact[Starting Point]`, `contact[Customer Name]`, `contact[email]`, `contact[Phone Number]`, `contact[Team Name]`, `contact[Team League/Level]`, `contact[Estimated Quantity]`, `contact[Order Timeline]`, `contact[Jersey Style]`, `contact[Jerseys]`, `contact[Socks]`, `contact[Pant shells]`, `contact[Artwork Status]`, `contact[Team Colours]`, `contact[Inspiration]`, `contact[Extra Details]`, plus the new `contact[Previous Order]`, `contact[What's Changed]`, `contact[Upload link]`, `contact[Order manager]`, and the honeypot `website`.

---

## File Structure

Manager (`C:\Apps\powerplay-order-manager`):
- `src/lib/types.ts` — **modify**: `STARTING_POINTS`, `StartingPoint`, `RouteVariant`, `ORDER_SOURCES`, `OrderSource`, `WebsiteEnquiry`; `Order.source`, `Order.enquiry`.
- `src/lib/order-utils.ts` — **modify**: `blankOrder()` sets `source: 'manual'`, `enquiry: null`.
- `src/lib/data/logic.ts` — **modify**: `healOrder` defaults; `rosterLinkView` returns `variant`.
- `src/lib/data/repository.ts` — **modify**: `getByRosterToken` return type gains `variant: RouteVariant | null`.
- `src/lib/data/intake-logic.ts` — **create**: parsing, tier lookup, route → sections, variant, dedupe key, draft patch, origin check, rate limiter. Pure.
- `src/lib/data/intake.ts` — **create**: `intakeOrder(input, repo, now)` — the one place that decides create-vs-update.
- `src/lib/route-copy.ts` — **create**: the per-variant intro and hints for the customer page.
- `src/app/api/intake/route.ts` — **create**: `OPTIONS` + `POST`.
- `src/app/api/intake/[token]/route.ts` — **create**: `OPTIONS` + `GET` "does this Draft exist yet".
- `src/proxy.ts` — **modify**: `/api/intake` public.
- `src/app/roster/[token]/page.tsx`, `src/app/roster/[token]/client-form.tsx` — **modify**: variant intro and hints.
- `src/components/ui.tsx` — **modify**: `WebsiteBadge`.
- `src/components/enquiry-card.tsx` — **create**: the "Website enquiry" section.
- `src/app/orders/page.tsx`, `src/app/orders/[id]/page.tsx` — **modify**: badge and card.
- `tests/intake/logic.test.ts`, `tests/intake/intake.test.ts`, `tests/intake/route-copy.test.ts` — **create**.
- `README.md`, `CLAUDE.md`, the spec — **modify** (docs).

Website (`K:\PP Customs\Website`):
- `changes/2026-09-20-contact-only/start-your-order.html` — **modify**: third card and form, honeypots, the hand-off, the success button.
- `changes/2026-09-20-contact-only/check-page.js` — **modify**: three forms.
- `CHANGELOG.md`, `STATUS.md`, `changes/2026-09-20-contact-only/build-log.md` — rows and notes.

---

### Task 1: Types, defaults and the spec amendments

**Files:**
- Modify: `src/lib/types.ts` (after the `DEFAULT_CLIENT_LINK_SECTIONS` block, and inside `interface Order` next to `contactPhone`)
- Modify: `src/lib/order-utils.ts` (`blankOrder`, next to `shareToken: newToken()`)
- Modify: `src/lib/data/logic.ts` (`healOrder`)
- Modify: `docs/superpowers/specs/2026-09-20-website-intake-design.md`
- Test: `tests/intake/logic.test.ts` (first test only)

**Interfaces:**
- Produces: `STARTING_POINTS`, `StartingPoint`, `RouteVariant = 'ready' | 'scratch' | 'reorder'`, `OrderSource = 'manual' | 'website'`, `WebsiteEnquiry`, `Order.source: OrderSource`, `Order.enquiry: WebsiteEnquiry | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/intake/logic.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healOrder } from '@/lib/data/logic';
import { blankOrder } from '@/lib/order-utils';
import type { Order } from '@/lib/types';

test('healOrder gives old rows a source and an empty enquiry', () => {
  const o = blankOrder() as Partial<Order>;
  delete o.source;
  delete o.enquiry;
  const healed = healOrder(o as Order);
  assert.equal(healed.source, 'manual');
  assert.equal(healed.enquiry, null);
});

test('blankOrder is a manual order with no enquiry', () => {
  const o = blankOrder();
  assert.equal(o.source, 'manual');
  assert.equal(o.enquiry, null);
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd C:\Apps\powerplay-order-manager && npm test`
Expected: the two new tests FAIL (`source` is `undefined`).

- [ ] **Step 3: Add the types**

In `src/lib/types.ts`, directly after the `DEFAULT_CLIENT_LINK_SECTIONS` constant:

```ts
/* ------------------------------------------------------------------ *
 * Website intake
 *
 * The website's order page offers three starting points. The one the
 * customer picked decides how their client-link page opens (see
 * src/lib/route-copy.ts) and which sections it asks for.
 * ------------------------------------------------------------------ */

export const STARTING_POINTS = ['Design ready', 'Starting from scratch', 'Ordered before'] as const;
export type StartingPoint = (typeof STARTING_POINTS)[number];

/** The customer page's flavour, derived from the starting point. `null` = an order Keenan made by hand. */
export type RouteVariant = 'ready' | 'scratch' | 'reorder';

export const ORDER_SOURCES = ['manual', 'website'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

/**
 * What the team typed on the website, word for word. Team name, contact and
 * jersey tier are also mapped into their normal Order fields; this keeps the
 * rest, so nothing they wrote is lost to a mapping.
 */
export interface WebsiteEnquiry {
  startingPoint: StartingPoint;
  league: string;
  quantity: string;
  timeline: string;
  jerseyStyle: string;
  items: string[];
  artworkStatus: string;
  colours: string;
  inspiration: string;
  extraDetails: string;
  previousOrder: string;
  /** ISO instant the enquiry arrived. A timestamp, not a calendar date. */
  receivedAt: string;
}
```

In `interface Order`, after `contactPhone: string;`:

```ts
  /** Where the order came from. Website orders carry the enquiry below. */
  source: OrderSource;
  enquiry: WebsiteEnquiry | null;
```

- [ ] **Step 4: Defaults**

In `src/lib/order-utils.ts` `blankOrder()`, after `contactPhone: '',` (or wherever the contact fields sit), add:

```ts
    source: 'manual',
    enquiry: null,
```

In `src/lib/data/logic.ts` `healOrder`, after `o.deletedAt ??= null;`:

```ts
  o.source ??= 'manual';
  o.enquiry ??= null;
```

- [ ] **Step 5: Run the tests, expect pass**

Run: `npm test`
Expected: PASS (the two new tests and everything that was already green).

- [ ] **Step 6: Fold the three planning deviations into the spec**

Edit `docs/superpowers/specs/2026-09-20-website-intake-design.md`, section "The website side", replacing its first bullet with:

```markdown
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
```

And in "Guards", replace the Dedupe bullet with:

```markdown
- **Dedupe.** Same `email` + `teamName` (case-insensitive, trimmed) as a **Draft** with `source: 'website'` created in the last 24 hours → update that Draft's `enquiry` and give it the newly generated roster token (the newest link the customer holds is the one that works), log it under the website actor, and return its links. Nothing else about the order is overwritten. A Draft Keenan has already promoted is left alone and a new Draft is made.
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/order-utils.ts src/lib/data/logic.ts tests/intake/logic.test.ts docs/superpowers/specs/2026-09-20-website-intake-design.md
git commit -m "Intake: order source and website enquiry fields"
```

---

### Task 2: The pure intake rules

**Files:**
- Create: `src/lib/data/intake-logic.ts`
- Test: `tests/intake/logic.test.ts` (append)

**Interfaces:**
- Produces:
  - `parseIntake(body: unknown): ParseResult` where `ParseResult = { ok: true; honeypot: true } | { ok: true; honeypot: false; value: IntakeInput } | { ok: false; error: string }`
  - `IntakeInput` — `{ rosterToken, startingPoint, customerName, email, teamName, phone, league, quantity, timeline, jerseyStyle, items: string[], artworkStatus, colours, inspiration, extraDetails, previousOrder }`, all strings except `items`
  - `tierFromStyle(style: string): { jerseyTier: JerseyTier; jerseyType: JerseyType } | null`
  - `variantOf(sp: StartingPoint | null | undefined): RouteVariant | null`
  - `sectionsForRoute(sp: StartingPoint): ClientLinkSections`
  - `splitName(full: string): { first: string; last: string }`
  - `dedupeKey(email: string, team: string): string`
  - `findDuplicate(orders: Order[], input: IntakeInput, now?: number): Order | null`
  - `enquiryOf(input: IntakeInput, receivedAt: string): WebsiteEnquiry`
  - `draftPatch(input: IntakeInput, receivedAt: string): Partial<Order>`
  - `isAllowedOrigin(origin: string | null, allow: string[]): boolean`, `allowedOrigins(env?: string): string[]`
  - `class RateLimiter { constructor(limit = 10, windowMs = 600_000); allow(key: string, now?: number): boolean }`
  - constants `INTAKE_ACTOR`, `INTAKE_MAX_BODY_BYTES = 16384`, `INTAKE_MAX_FIELD = 2000`, `DEDUPE_WINDOW_MS`, `TOKEN_RE = /^[0-9a-f]{64}$/`

- [ ] **Step 1: Write the failing tests** (append to `tests/intake/logic.test.ts`)

```ts
import {
  allowedOrigins, dedupeKey, draftPatch, findDuplicate, isAllowedOrigin, parseIntake,
  RateLimiter, sectionsForRoute, splitName, tierFromStyle, variantOf,
} from '@/lib/data/intake-logic';

const TOKEN = 'a'.repeat(64);
const good = {
  rosterToken: TOKEN, startingPoint: 'Starting from scratch', customerName: 'Sam Carter',
  email: 'sam@example.com', teamName: 'Ice Cats', quantity: '18 players + 2 goalies',
  jerseyStyle: 'Elite (Embroidery)', items: ['Jerseys', 'Socks'], colours: 'navy and gold',
};

test('parseIntake accepts a good body and trims it', () => {
  const r = parseIntake({ ...good, teamName: '  Ice Cats ', bogus: 'ignored' });
  assert.equal(r.ok, true);
  if (!r.ok || r.honeypot) throw new Error('expected a value');
  assert.equal(r.value.teamName, 'Ice Cats');
  assert.deepEqual(r.value.items, ['Jerseys', 'Socks']);
  assert.equal(r.value.previousOrder, '');
});

test('parseIntake refuses a missing email, a bad token and an unknown route', () => {
  assert.equal(parseIntake({ ...good, email: 'nope' }).ok, false);
  assert.equal(parseIntake({ ...good, rosterToken: 'short' }).ok, false);
  assert.equal(parseIntake({ ...good, startingPoint: 'Other' }).ok, false);
  assert.equal(parseIntake('text').ok, false);
});

test('parseIntake treats a filled honeypot as success with nothing to do', () => {
  const r = parseIntake({ ...good, website: 'http://spam' });
  assert.deepEqual(r, { ok: true, honeypot: true });
});

test('parseIntake caps fields at 2000 characters and drops unknown items', () => {
  const r = parseIntake({ ...good, extraDetails: 'x'.repeat(5000), items: ['Jerseys', 'Helmets'] });
  if (!r.ok || r.honeypot) throw new Error('expected a value');
  assert.equal(r.value.extraDetails.length, 2000);
  assert.deepEqual(r.value.items, ['Jerseys']);
});

test('tierFromStyle maps the five tiers and nothing else', () => {
  assert.deepEqual(tierFromStyle('Lite (Sublimated)'), { jerseyTier: 'lite', jerseyType: 'sublimated' });
  assert.deepEqual(tierFromStyle('Elite (Embroidery)'), { jerseyTier: 'elite', jerseyType: 'embroidered' });
  assert.deepEqual(tierFromStyle('Premier (Sublimated)'), { jerseyTier: 'premier', jerseyType: 'sublimated' });
  assert.deepEqual(tierFromStyle('Pro (Embroidery)'), { jerseyTier: 'pro', jerseyType: 'embroidered' });
  assert.deepEqual(tierFromStyle('Reversible (Sublimated)'), { jerseyTier: 'reversible', jerseyType: 'reversible_sublimated' });
  assert.equal(tierFromStyle('Not sure — help me pick'), null);
  assert.equal(tierFromStyle(''), null);
});

test('routes map to variants and section sets', () => {
  assert.equal(variantOf('Design ready'), 'ready');
  assert.equal(variantOf('Starting from scratch'), 'scratch');
  assert.equal(variantOf('Ordered before'), 'reorder');
  assert.equal(variantOf(null), null);
  assert.deepEqual(sectionsForRoute('Design ready'), { logos: true, inspiration: true, roster: false, personalDetails: false });
  assert.deepEqual(sectionsForRoute('Ordered before'), { logos: false, inspiration: false, roster: true, personalDetails: true });
});

test('splitName and dedupeKey', () => {
  assert.deepEqual(splitName('Sam Carter'), { first: 'Sam', last: 'Carter' });
  assert.deepEqual(splitName('Cher'), { first: 'Cher', last: '' });
  assert.deepEqual(splitName('Mary Anne  Smith'), { first: 'Mary', last: 'Anne  Smith' });
  assert.equal(dedupeKey(' Sam@Example.com ', 'ice  cats'), 'sam@example.com|ice cats');
});

test('draftPatch builds a website Draft with the link on', () => {
  const r = parseIntake(good);
  if (!r.ok || r.honeypot) throw new Error('expected a value');
  const p = draftPatch(r.value, '2026-09-20T18:00:00.000Z');
  assert.equal(p.status, 'draft');
  assert.equal(p.source, 'website');
  assert.equal(p.rosterToken, TOKEN);
  assert.equal(p.teamName, 'Ice Cats');
  assert.equal(p.contactFirstName, 'Sam');
  assert.equal(p.contactLastName, 'Carter');
  assert.equal(p.contactEmail, 'sam@example.com');
  assert.equal(p.jerseyTier, 'elite');
  assert.equal(p.jerseyType, 'embroidered');
  assert.equal(p.requestClientDetails, true);
  assert.deepEqual(p.clientLinkSections, { logos: true, inspiration: true, roster: false, personalDetails: false });
  assert.equal(p.enquiry?.startingPoint, 'Starting from scratch');
  assert.equal(p.enquiry?.receivedAt, '2026-09-20T18:00:00.000Z');
  assert.equal('specialNotes' in p, false);
});

test('findDuplicate matches a recent website Draft by email + team only', () => {
  const r = parseIntake(good);
  if (!r.ok || r.honeypot) throw new Error('expected a value');
  const now = Date.parse('2026-09-20T18:00:00.000Z');
  const base = { ...blankOrder(), source: 'website' as const, status: 'draft' as const, teamName: 'Ice Cats', contactEmail: 'SAM@example.com', createdAt: new Date(now - 3600_000).toISOString() };
  assert.equal(findDuplicate([base], r.value, now)?.id, base.id);
  assert.equal(findDuplicate([{ ...base, createdAt: new Date(now - 25 * 3600_000).toISOString() }], r.value, now), null);
  assert.equal(findDuplicate([{ ...base, source: 'manual' }], r.value, now), null);
  assert.equal(findDuplicate([{ ...base, status: 'waiting_for_payment' }], r.value, now), null);
  assert.equal(findDuplicate([{ ...base, deletedAt: '2026-09-20T17:00:00.000Z' }], r.value, now), null);
});

test('origins and the rate limiter', () => {
  assert.deepEqual(allowedOrigins(undefined), ['https://www.powerplaycustoms.ca', 'https://powerplaycustoms.ca']);
  assert.deepEqual(allowedOrigins(' https://a.test , https://b.test/ '), ['https://a.test', 'https://b.test']);
  assert.equal(isAllowedOrigin('https://www.powerplaycustoms.ca', allowedOrigins(undefined)), true);
  assert.equal(isAllowedOrigin('https://evil.test', allowedOrigins(undefined)), false);
  assert.equal(isAllowedOrigin(null, allowedOrigins(undefined)), false);
  const rl = new RateLimiter(2, 1000);
  assert.equal(rl.allow('ip', 0), true);
  assert.equal(rl.allow('ip', 1), true);
  assert.equal(rl.allow('ip', 2), false);
  assert.equal(rl.allow('ip', 1001), true);
  assert.equal(rl.allow('other', 2), true);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test`
Expected: FAIL — cannot find module `@/lib/data/intake-logic`.

- [ ] **Step 3: Write `src/lib/data/intake-logic.ts`**

```ts
import {
  STARTING_POINTS,
  type ClientLinkSections, type JerseyTier, type JerseyType, type Order, type RouteVariant,
  type StartingPoint, type WebsiteEnquiry,
} from '@/lib/types';
import type { Actor } from './repository';

/* ------------------------------------------------------------------ *
 * Website intake — the rules.
 *
 * The website's order page posts an enquiry here (see /api/intake). Nothing
 * in this file touches storage or the network, so every rule is testable on
 * its own and both storage backends get the same behaviour.
 * ------------------------------------------------------------------ */

export const INTAKE_MAX_BODY_BYTES = 16 * 1024;
export const INTAKE_MAX_FIELD = 2000;
export const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_ALLOWED_ORIGINS = ['https://www.powerplaycustoms.ca', 'https://powerplaycustoms.ca'];
export const INTAKE_ACTOR: Actor = { email: 'website@powerplaycustoms.ca', name: 'Website enquiry' };
/** Same shape newToken() makes: two UUIDs without dashes. The page mints it the same way. */
export const TOKEN_RE = /^[0-9a-f]{64}$/;

export interface IntakeInput {
  rosterToken: string;
  startingPoint: StartingPoint;
  customerName: string;
  email: string;
  teamName: string;
  phone: string;
  league: string;
  quantity: string;
  timeline: string;
  jerseyStyle: string;
  items: string[];
  artworkStatus: string;
  colours: string;
  inspiration: string;
  extraDetails: string;
  previousOrder: string;
}

export type ParseResult =
  | { ok: true; honeypot: true }
  | { ok: true; honeypot: false; value: IntakeInput }
  | { ok: false; error: string };

const str = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, INTAKE_MAX_FIELD) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ITEMS = ['Jerseys', 'Socks', 'Pant shells'];

export function parseIntake(body: unknown): ParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Expected a JSON object.' };
  const b = body as Record<string, unknown>;

  // Honeypot: a real browser never fills it. Say "ok" so a bot learns nothing.
  if (str(b.website)) return { ok: true, honeypot: true };

  const rosterToken = str(b.rosterToken).toLowerCase();
  if (!TOKEN_RE.test(rosterToken)) return { ok: false, error: 'rosterToken must be 64 hex characters.' };
  const startingPoint = str(b.startingPoint) as StartingPoint;
  if (!STARTING_POINTS.includes(startingPoint)) {
    return { ok: false, error: 'startingPoint must be one of: ' + STARTING_POINTS.join(', ') + '.' };
  }
  const customerName = str(b.customerName);
  if (!customerName) return { ok: false, error: 'customerName is required.' };
  const email = str(b.email);
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'email must be a valid email address.' };
  const teamName = str(b.teamName);
  if (!teamName) return { ok: false, error: 'teamName is required.' };

  const rawItems = Array.isArray(b.items) ? b.items : typeof b.items === 'string' ? b.items.split(',') : [];
  const items = rawItems.map(str).filter((i) => ITEMS.includes(i));

  return {
    ok: true,
    honeypot: false,
    value: {
      rosterToken, startingPoint, customerName, email, teamName,
      phone: str(b.phone), league: str(b.league), quantity: str(b.quantity), timeline: str(b.timeline),
      jerseyStyle: str(b.jerseyStyle), items, artworkStatus: str(b.artworkStatus), colours: str(b.colours),
      inspiration: str(b.inspiration), extraDetails: str(b.extraDetails), previousOrder: str(b.previousOrder),
    },
  };
}

/**
 * "Elite (Embroidery)" → elite/embroidered. Word boundaries matter: "Elite"
 * contains "lite", so the tier list is checked as whole words, and Reversible
 * first because it is the one tier with its own construction.
 */
export function tierFromStyle(style: string): { jerseyTier: JerseyTier; jerseyType: JerseyType } | null {
  const s = style.toLowerCase();
  if (/\breversible\b/.test(s)) return { jerseyTier: 'reversible', jerseyType: 'reversible_sublimated' };
  if (/\belite\b/.test(s)) return { jerseyTier: 'elite', jerseyType: 'embroidered' };
  if (/\blite\b/.test(s)) return { jerseyTier: 'lite', jerseyType: 'sublimated' };
  if (/\bpremier\b/.test(s)) return { jerseyTier: 'premier', jerseyType: 'sublimated' };
  if (/\bpro\b/.test(s)) return { jerseyTier: 'pro', jerseyType: 'embroidered' };
  return null;
}

export function variantOf(sp: StartingPoint | null | undefined): RouteVariant | null {
  switch (sp) {
    case 'Design ready': return 'ready';
    case 'Starting from scratch': return 'scratch';
    case 'Ordered before': return 'reorder';
    default: return null;
  }
}

/**
 * What the customer's page asks for, by route. Logos and inspiration for the
 * two design routes (roster comes after the design is approved; they just gave
 * their contact details); roster and shipping for a returning team, whose
 * design we already have.
 */
export function sectionsForRoute(sp: StartingPoint): ClientLinkSections {
  return variantOf(sp) === 'reorder'
    ? { logos: false, inspiration: false, roster: true, personalDetails: true }
    : { logos: true, inspiration: true, roster: false, personalDetails: false };
}

export function splitName(full: string): { first: string; last: string } {
  const i = full.indexOf(' ');
  return i < 0 ? { first: full, last: '' } : { first: full.slice(0, i), last: full.slice(i + 1).trim() };
}

export function dedupeKey(email: string, team: string): string {
  return email.trim().toLowerCase() + '|' + team.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** A Draft from the website, same person and team, inside the window. Promoted orders are never touched. */
export function findDuplicate(orders: Order[], input: IntakeInput, now = Date.now()): Order | null {
  const key = dedupeKey(input.email, input.teamName);
  return (
    orders.find(
      (o) =>
        o.source === 'website' &&
        o.status === 'draft' &&
        !o.deletedAt &&
        now - Date.parse(o.createdAt) < DEDUPE_WINDOW_MS &&
        dedupeKey(o.contactEmail, o.teamName) === key,
    ) ?? null
  );
}

export function enquiryOf(input: IntakeInput, receivedAt: string): WebsiteEnquiry {
  return {
    startingPoint: input.startingPoint,
    league: input.league,
    quantity: input.quantity,
    timeline: input.timeline,
    jerseyStyle: input.jerseyStyle,
    items: input.items,
    artworkStatus: input.artworkStatus,
    colours: input.colours,
    inspiration: input.inspiration,
    extraDetails: input.extraDetails,
    previousOrder: input.previousOrder,
    receivedAt,
  };
}

export function draftPatch(input: IntakeInput, receivedAt: string): Partial<Order> {
  const { first, last } = splitName(input.customerName);
  const tier = tierFromStyle(input.jerseyStyle);
  return {
    status: 'draft',
    source: 'website',
    rosterToken: input.rosterToken,
    teamName: input.teamName,
    contactFirstName: first,
    contactLastName: last,
    contactEmail: input.email,
    contactPhone: input.phone,
    requestClientDetails: true,
    clientLinkSections: sectionsForRoute(input.startingPoint),
    ...(tier ?? {}),
    enquiry: enquiryOf(input, receivedAt),
  };
}

export function allowedOrigins(env: string | undefined = process.env.INTAKE_ALLOWED_ORIGINS): string[] {
  const list = (env ?? '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  return list.length ? list : DEFAULT_ALLOWED_ORIGINS;
}

export function isAllowedOrigin(origin: string | null, allow: string[]): boolean {
  return !!origin && allow.includes(origin.replace(/\/+$/, ''));
}

/** Per-instance, in memory. Stops a loop; not a security boundary (Vercel may run several instances). */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limit = 10, private windowMs = 10 * 60 * 1000) {}
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) { this.hits.set(key, recent); return false; }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/intake-logic.ts tests/intake/logic.test.ts
git commit -m "Intake: parsing, tier lookup, route sections, dedupe, origin and rate rules"
```

---

### Task 3: The write, the routes and the front-door exemption

**Files:**
- Create: `src/lib/data/intake.ts`
- Create: `src/app/api/intake/route.ts`
- Create: `src/app/api/intake/[token]/route.ts`
- Modify: `src/proxy.ts` (`PUBLIC_PREFIXES`)
- Test: `tests/intake/intake.test.ts`

**Interfaces:**
- Consumes: Task 2's functions; `Repository.listOrders/createOrder/updateOrder/getByRosterToken`; `baseUrl()` from `src/lib/base-url.ts`.
- Produces: `intakeOrder(input: IntakeInput, repo: IntakeRepo, now?: Date): Promise<{ order: Order; created: boolean }>` where `IntakeRepo = Pick<Repository, 'listOrders' | 'createOrder' | 'updateOrder' | 'getByRosterToken'>`; HTTP `POST /api/intake` → `200 { ok, orderId, rosterUrl, managerUrl }` / `400` / `403` / `409` / `413` / `429`; `GET /api/intake/<token>` → `200 { ok: true, ready: boolean }`.

- [ ] **Step 1: Write the failing test** — `tests/intake/intake.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intakeOrder } from '@/lib/data/intake';
import { parseIntake } from '@/lib/data/intake-logic';
import { blankOrder } from '@/lib/order-utils';
import type { Actor } from '@/lib/data/repository';
import type { Order } from '@/lib/types';

function fakeRepo(seed: Order[] = []) {
  const orders = [...seed];
  const log: string[] = [];
  return {
    orders, log,
    async listOrders() { return orders.filter((o) => !o.deletedAt); },
    async getByRosterToken(token: string) { return orders.some((o) => o.rosterToken === token) ? ({} as never) : null; },
    async createOrder(patch: Partial<Order>, actor: Actor) {
      const o = { ...blankOrder(), ...patch, createdAt: new Date().toISOString() } as Order;
      orders.push(o); log.push('create by ' + actor.name); return o;
    },
    async updateOrder(id: string, patch: Partial<Order>, actor: Actor) {
      const i = orders.findIndex((o) => o.id === id); orders[i] = { ...orders[i], ...patch };
      log.push('update by ' + actor.name); return orders[i];
    },
  };
}

const T1 = 'a'.repeat(64), T2 = 'b'.repeat(64);
const body = (t: string) => ({ rosterToken: t, startingPoint: 'Ordered before', customerName: 'Sam Carter', email: 'sam@example.com', teamName: 'Ice Cats', previousOrder: 'Ice Cats 2025' });
const input = (t: string) => { const r = parseIntake(body(t)); if (!r.ok || r.honeypot) throw new Error('bad'); return r.value; };

test('first enquiry creates a website Draft carrying the token', async () => {
  const repo = fakeRepo();
  const { order, created } = await intakeOrder(input(T1), repo);
  assert.equal(created, true);
  assert.equal(order.source, 'website');
  assert.equal(order.rosterToken, T1);
  assert.deepEqual(order.clientLinkSections, { logos: false, inspiration: false, roster: true, personalDetails: true });
  assert.deepEqual(repo.log, ['create by Website enquiry']);
});

test('a second enquiry inside a day updates the Draft and moves the link to the new token', async () => {
  const repo = fakeRepo();
  await intakeOrder(input(T1), repo);
  const { order, created } = await intakeOrder({ ...input(T2), colours: 'red' }, repo);
  assert.equal(created, false);
  assert.equal(repo.orders.length, 1);
  assert.equal(order.rosterToken, T2);
  assert.equal(order.enquiry?.colours, 'red');
  assert.deepEqual(repo.log, ['create by Website enquiry', 'update by Website enquiry']);
});

test('a token already used by another order is refused', async () => {
  const repo = fakeRepo([{ ...blankOrder(), rosterToken: T1, teamName: 'Someone Else' }]);
  await assert.rejects(() => intakeOrder(input(T1), repo), /token/i);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test` → FAIL, cannot find `@/lib/data/intake`.

- [ ] **Step 3: Write `src/lib/data/intake.ts`**

```ts
import type { Order } from '@/lib/types';
import type { Repository } from './repository';
import { draftPatch, enquiryOf, findDuplicate, INTAKE_ACTOR, type IntakeInput } from './intake-logic';

export type IntakeRepo = Pick<Repository, 'listOrders' | 'createOrder' | 'updateOrder' | 'getByRosterToken'>;

export class TokenTakenError extends Error {
  constructor() { super('That roster token already belongs to another order.'); }
}

/**
 * Create-or-update for a website enquiry. The one place that decides which.
 *
 * The token comes from the page (it needs it in the email before we've
 * answered), so the only check here is that nobody else already holds it.
 */
export async function intakeOrder(input: IntakeInput, repo: IntakeRepo, now = new Date()): Promise<{ order: Order; created: boolean }> {
  const receivedAt = now.toISOString();
  const dup = findDuplicate(await repo.listOrders({ status: 'draft' }), input, now.getTime());

  const holder = await repo.getByRosterToken(input.rosterToken);
  if (holder && (!dup || dup.rosterToken !== input.rosterToken)) throw new TokenTakenError();

  if (dup) {
    const order = await repo.updateOrder(
      dup.id,
      { enquiry: enquiryOf(input, receivedAt), rosterToken: input.rosterToken },
      INTAKE_ACTOR,
    );
    return { order, created: false };
  }
  const order = await repo.createOrder(draftPatch(input, receivedAt), INTAKE_ACTOR);
  return { order, created: true };
}
```

- [ ] **Step 4: Run, expect pass** — `npm test` → PASS.

- [ ] **Step 5: The POST route** — `src/app/api/intake/route.ts`

```ts
import { NextResponse } from 'next/server';
import { repo } from '@/lib/data';
import { baseUrl } from '@/lib/base-url';
import { intakeOrder, TokenTakenError } from '@/lib/data/intake';
import { allowedOrigins, INTAKE_MAX_BODY_BYTES, isAllowedOrigin, parseIntake, RateLimiter } from '@/lib/data/intake-logic';

export const dynamic = 'force-dynamic';

/**
 * The website's order page posts an enquiry here the moment a team presses
 * send. No session — what stands in for auth is the browser Origin (only the
 * website's), a honeypot, size caps and a light rate limit. Everything else
 * lives in intake-logic.ts / intake.ts so it is tested without HTTP.
 */

const limiter = new RateLimiter();

export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export function originOf(req: Request): string | null {
  const origin = req.headers.get('origin');
  return isAllowedOrigin(origin, allowedOrigins()) ? origin : null;
}

export async function OPTIONS(req: Request) {
  const origin = originOf(req);
  if (!origin) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = originOf(req);
  if (!origin) return NextResponse.json({ ok: false, error: 'Origin not allowed.' }, { status: 403 });
  const h = corsHeaders(origin);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (!limiter.allow(ip)) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again in a few minutes.' }, { status: 429, headers: h });
  }

  const text = await req.text();
  if (text.length > INTAKE_MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: 'Too large.' }, { status: 413, headers: h });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ ok: false, error: 'Body must be JSON.' }, { status: 400, headers: h }); }

  const parsed = parseIntake(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400, headers: h });
  if (parsed.honeypot) return NextResponse.json({ ok: true }, { headers: h });

  try {
    const { order } = await intakeOrder(parsed.value, repo);
    const base = await baseUrl();
    return NextResponse.json(
      { ok: true, orderId: order.id, rosterUrl: `${base}/roster/${order.rosterToken}`, managerUrl: `${base}/orders/${order.id}` },
      { headers: h },
    );
  } catch (e) {
    if (e instanceof TokenTakenError) return NextResponse.json({ ok: false, error: e.message }, { status: 409, headers: h });
    throw e;
  }
}
```

- [ ] **Step 6: The existence check** — `src/app/api/intake/[token]/route.ts`

```ts
import { NextResponse } from 'next/server';
import { repo } from '@/lib/data';
import { TOKEN_RE } from '@/lib/data/intake-logic';
import { corsHeaders, originOf } from '../route';

export const dynamic = 'force-dynamic';

/**
 * "Has the Draft for this token been created yet?" — asked by the website's
 * success panel before it shows the upload button, because the enquiry is
 * sent with a keepalive fetch the page never waits for. Reveals nothing but
 * existence, for a 64-hex token the asker already holds.
 */
export async function OPTIONS(req: Request) {
  const origin = originOf(req);
  if (!origin) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const origin = originOf(req);
  if (!origin) return NextResponse.json({ ok: false, error: 'Origin not allowed.' }, { status: 403 });
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ ok: false, error: 'Bad token.' }, { status: 400, headers: corsHeaders(origin) });
  const link = await repo.getByRosterToken(token);
  return NextResponse.json({ ok: true, ready: !!link }, { headers: corsHeaders(origin) });
}
```

Note: Next.js route files may only export HTTP verbs and config; exporting `corsHeaders`/`originOf` from `route.ts` is not allowed. Put those two functions in `src/lib/intake-http.ts` instead and import them in both routes:

```ts
// src/lib/intake-http.ts
import { allowedOrigins, isAllowedOrigin } from '@/lib/data/intake-logic';
export function corsHeaders(origin: string): Record<string, string> { /* as above */ }
export function originOf(req: Request): string | null { /* as above */ }
```
and delete the two definitions from `route.ts`.

- [ ] **Step 7: Open the front door for it** — `src/proxy.ts`

```ts
const PUBLIC_PREFIXES = ['/unlock', '/share/', '/roster/', '/api/public-upload/', '/api/intake'];
```
and add to the comment block: `/api/intake           website enquiries in (origin-gated, see intake-logic.ts)`.

- [ ] **Step 8: Build and lint**

Run: `npm run lint && npm run build`
Expected: no errors. (If lint flags the unused `req` in `OPTIONS`, keep it — the signature is what Next expects — or prefix with `_`.)

- [ ] **Step 9: Local smoke test with the JSON store**

Run `npm run dev` in one terminal (no Supabase env → `data/db.json`), then:
```bash
T=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
curl -s -X POST http://localhost:3000/api/intake -H "Origin: https://www.powerplaycustoms.ca" -H "Content-Type: application/json" -d "{\"rosterToken\":\"$T\",\"startingPoint\":\"Design ready\",\"customerName\":\"Sam Carter\",\"email\":\"sam@example.com\",\"teamName\":\"Local Test\"}"
curl -s http://localhost:3000/api/intake/$T -H "Origin: https://www.powerplaycustoms.ca"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/intake -H "Origin: https://evil.test" -H "Content-Type: application/json" -d '{}'
```
Expected: `{"ok":true,"orderId":…,"rosterUrl":"http://localhost:3000/roster/<T>",…}`, then `{"ok":true,"ready":true}`, then `403`. Open the rosterUrl in a browser: the page renders (the variant copy comes in Task 4). Stop the dev server; `data/db.json` is gitignored.

- [ ] **Step 10: Commit**

```bash
git add src/lib/data/intake.ts src/lib/intake-http.ts src/app/api/intake src/proxy.ts tests/intake/intake.test.ts
git commit -m "Intake: POST /api/intake creates or updates a website Draft; GET /api/intake/<token>"
```

---

### Task 4: The customer page knows its route

**Files:**
- Create: `src/lib/route-copy.ts`
- Modify: `src/lib/data/logic.ts` (`rosterLinkView` return type and object)
- Modify: `src/lib/data/repository.ts` (`getByRosterToken` return type: add `variant: RouteVariant | null;`)
- Modify: `src/app/roster/[token]/page.tsx`
- Modify: `src/app/roster/[token]/client-form.tsx`
- Test: `tests/intake/route-copy.test.ts`

**Interfaces:**
- Produces: `ROUTE_COPY: Record<RouteVariant, { title: string; intro: string; logosHint: string; inspirationHint: string }>`; `rosterLinkView(...).variant`; `ClientForm` prop `variant: RouteVariant | null`.

- [ ] **Step 1: Failing test** — `tests/intake/route-copy.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_COPY } from '@/lib/route-copy';
import { rosterLinkView } from '@/lib/data/logic';
import { blankOrder } from '@/lib/order-utils';

test('every variant has a title, intro and both hints', () => {
  for (const v of ['ready', 'scratch', 'reorder'] as const) {
    const c = ROUTE_COPY[v];
    assert.ok(c.title.length > 5 && c.intro.length > 20 && c.logosHint.length > 10 && c.inspirationHint.length > 10, v);
  }
  assert.equal(ROUTE_COPY.reorder.title, 'Same design, new season');
});

test('rosterLinkView carries the variant from the enquiry', () => {
  const manual = blankOrder();
  assert.equal(rosterLinkView(manual, 0).variant, null);
  const web = { ...blankOrder(), enquiry: { startingPoint: 'Ordered before', league: '', quantity: '', timeline: '', jerseyStyle: '', items: [], artworkStatus: '', colours: '', inspiration: '', extraDetails: '', previousOrder: '', receivedAt: '2026-09-20T18:00:00.000Z' } as const };
  assert.equal(rosterLinkView(web, 0).variant, 'reorder');
});
```

- [ ] **Step 2: Run, expect failure** — `npm test` → FAIL (no `@/lib/route-copy`; `variant` undefined).

- [ ] **Step 3: `src/lib/route-copy.ts`**

```ts
import type { RouteVariant } from '@/lib/types';

/**
 * How the customer's page opens, by the route they picked on the website.
 * Hand-made orders have no variant and keep the page's generic wording.
 */
export const ROUTE_COPY: Record<RouteVariant, { title: string; intro: string; logosHint: string; inspirationHint: string }> = {
  ready: {
    title: 'Send us your design files',
    intro: "Logos, crest, any artwork you have — vector or the highest resolution you've got. Anything you'd like us to match goes under inspiration. Mockup back today.",
    logosHint: 'Vector (AI, EPS, SVG, PDF) is best. Otherwise the biggest PNG or JPG you have.',
    inspirationHint: "Optional. Anything you'd like the design to match — a photo of the old jerseys, a look you like.",
  },
  scratch: {
    title: 'Show us what you like',
    intro: 'Any logo you already have goes first. Then pictures of looks you like — other jerseys, colour combos — and a line on what you like about each. We build the design from these.',
    logosHint: "If you have one. A team crest, a sponsor logo, even a sketch. No logo yet is fine — skip this.",
    inspirationHint: 'Pictures of looks you like — other jerseys, colour combos, anything. Tell us what you like about each one.',
  },
  reorder: {
    title: 'Same design, new season',
    intro: "Tell us who's getting what — names as printed, numbers, sizes — and check the shipping details. Leave anything you don't know yet; you can come back to this link.",
    logosHint: 'Only if something changed — a new sponsor, a new crest.',
    inspirationHint: 'Only if you want the look changed.',
  },
};
```

- [ ] **Step 4: `rosterLinkView` gains `variant`**

In `src/lib/data/logic.ts`: import `variantOf` from `./intake-logic` and `type RouteVariant` from `@/lib/types`; add `variant: RouteVariant | null;` to the return type (after `sections`) and `variant: variantOf(o.enquiry?.startingPoint),` to the object. In `src/lib/data/repository.ts` add the same line to the `getByRosterToken` return type after `sections: ClientLinkSections;`.

- [ ] **Step 5: The page and the form**

`src/app/roster/[token]/page.tsx`: import `ROUTE_COPY` from `@/lib/route-copy`; where the "We need a few things from you…" paragraph is rendered (the `previous ? … : …` branch), replace the non-`previous` branch with:

```tsx
            link.variant ? (
              <>
                <p className="mt-2 text-base font-semibold text-fg">{ROUTE_COPY[link.variant].title}</p>
                <p className="mt-1 text-sm text-muted">{ROUTE_COPY[link.variant].intro}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                We need a few things from you to get this order moving:{' '}
                {asked.map((k) => CLIENT_LINK_SECTION_META[k].label.toLowerCase()).join(', ')}.
                Fill in what you can — takes a few minutes.
              </p>
            )
```
and pass `variant={link.variant}` to `<ClientForm …>`.

`src/app/roster/[token]/client-form.tsx`: add `variant: RouteVariant | null;` to `Props` (import the type), destructure it, import `ROUTE_COPY`, and change the two hints:

```tsx
<Step n={stepNums.logos} title="Logos" hint={variant ? ROUTE_COPY[variant].logosHint : 'Team logo, sponsor logos, crest files. The higher the resolution, the better it prints.'}>
…
<Step n={stepNums.inspiration} title="Design Inspiration" hint={variant ? ROUTE_COPY[variant].inspirationHint : 'Pictures of looks you like — other jerseys, colour combos, anything. Tell us what you like about each one.'}>
```

Check `text-fg` exists as a Tailwind colour in this project (`grep -rn "text-fg" src | head -1`); if not, use `text-white`.

- [ ] **Step 6: Tests, lint, build** — `npm test && npm run lint && npm run build` → all pass. Local look: `npm run dev`, open the rosterUrl from Task 3 step 9 → the "Send us your design files" intro shows; open a hand-made order's client link → old wording.

- [ ] **Step 7: Commit**

```bash
git add src/lib/route-copy.ts src/lib/data/logic.ts src/lib/data/repository.ts src/app/roster tests/intake/route-copy.test.ts
git commit -m "Customer page: intro and hints follow the route chosen on the website"
```

---

### Task 5: Badge and enquiry card in the manager

**Files:**
- Modify: `src/components/ui.tsx` (append)
- Create: `src/components/enquiry-card.tsx`
- Modify: `src/app/orders/page.tsx` (the card header, next to `<StatusBadge status={order.status} />`)
- Modify: `src/app/orders/[id]/page.tsx` (header badge; the card after the CopyButton row)

- [ ] **Step 1: `WebsiteBadge`** — append to `src/components/ui.tsx`:

```tsx
/** Marks an order that arrived from the website's enquiry form. */
export function WebsiteBadge({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-ppc-gold/60 bg-ppc-gold/10 font-semibold whitespace-nowrap text-ppc-gold ${
        size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'
      }`}
    >
      Website
    </span>
  );
}
```

- [ ] **Step 2: `src/components/enquiry-card.tsx`**

```tsx
import { Field, Section } from '@/components/ui';
import type { WebsiteEnquiry } from '@/lib/types';

/**
 * What the team wrote on the website, word for word. Internal only — this
 * never goes near the share page. Empty fields are skipped, so the card is
 * as long as what they said and no longer.
 */
export function EnquiryCard({ enquiry }: { enquiry: WebsiteEnquiry }) {
  const rows: Array<[string, string]> = [
    ['Starting point', enquiry.startingPoint],
    ['How many', enquiry.quantity],
    ['Needed by', enquiry.timeline],
    ['League / level', enquiry.league],
    ['Jersey style', enquiry.jerseyStyle],
    ['Ordering', enquiry.items.join(', ')],
    ['Artwork', enquiry.artworkStatus],
    ['Team colours', enquiry.colours],
    ['Inspiration', enquiry.inspiration],
    ['Previous order', enquiry.previousOrder],
    ['Anything else', enquiry.extraDetails],
  ];
  const received = new Date(enquiry.receivedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <Section title="Website enquiry">
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.filter(([, v]) => v).map(([label, value]) => (
          <Field key={label} label={label}>{value}</Field>
        ))}
        <Field label="Received">{received}</Field>
      </div>
    </Section>
  );
}
```

- [ ] **Step 3: Wire it in**

`src/app/orders/page.tsx`: import `WebsiteBadge` from `@/components/ui`; change the card header to

```tsx
        <div className="flex items-center gap-1.5">
          {order.source === 'website' && <WebsiteBadge />}
          <StatusBadge status={order.status} />
        </div>
```

`src/app/orders/[id]/page.tsx`: import `WebsiteBadge` and `EnquiryCard`; in the header `div.flex.items-center.gap-2` add `{order.source === 'website' && <WebsiteBadge size="lg" />}` before the `StatusBadge`; after the `<div className="flex flex-wrap gap-2">…CopyButton…</div>` block add `{order.enquiry && <EnquiryCard enquiry={order.enquiry} />}`.

- [ ] **Step 4: Lint, build, look once** — `npm run lint && npm run build`; `npm run dev`, unlock with the code from `admin-code.txt`, open `/orders` with Drafts shown → the "Local Test" order carries the Website badge; open it → the enquiry card lists Starting point and Received. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui.tsx src/components/enquiry-card.tsx src/app/orders/page.tsx "src/app/orders/[id]/page.tsx"
git commit -m "Orders: Website badge and the enquiry card"
```

---

### Task 6: Docs, deploy, live verification

**Files:**
- Modify: `README.md` ("Built so far": add `- Website intake — POST /api/intake creates a Draft from the website's order page, with the client link on and shaped for the route`), `CLAUDE.md` (a paragraph under storage: `INTAKE_ALLOWED_ORIGINS` env var, default the two site origins; `/api/intake` is public by origin, like `/api/public-upload`).

- [ ] **Step 1: Full check** — `npm test && npm run lint && npm run build` → green. Commit the docs: `git commit -am "Docs: website intake"`.

- [ ] **Step 2: Tell Keenan, then push** — say in chat that the manager deploy is going out, then `git push origin main`. Watch Vercel finish (about two minutes): `curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS https://orders.powerplaycustoms.ca/api/intake -H "Origin: https://www.powerplaycustoms.ca"` → `204` once live (it is `307` to `/unlock` on the old build).

- [ ] **Step 3: Live smoke test**

```bash
T=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
curl -s -X POST https://orders.powerplaycustoms.ca/api/intake -H "Origin: https://www.powerplaycustoms.ca" -H "Content-Type: application/json" -d "{\"rosterToken\":\"$T\",\"startingPoint\":\"Ordered before\",\"customerName\":\"TEST please ignore\",\"email\":\"info@powerplaycustoms.ca\",\"teamName\":\"Test Team — ignore\",\"previousOrder\":\"none, this is a test\"}"
curl -s "https://orders.powerplaycustoms.ca/api/intake/$T" -H "Origin: https://www.powerplaycustoms.ca"
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://orders.powerplaycustoms.ca/api/intake -H "Origin: https://evil.test" -H "Content-Type: application/json" -d '{}'
curl -s "https://orders.powerplaycustoms.ca/roster/$T" | grep -o "Same design, new season"
```
Expected: `ok:true` with `rosterUrl` on the live host; `ready:true`; `403`; the reorder title. Note the test Draft's team name in the build log so Keenan can delete it (or delete it yourself if the admin code in `admin-code.txt` unlocks the live site).

---

### Task 7: The website page — third route, honeypots, the hand-off, the button

**Files:**
- Modify: `K:\PP Customs\Website\changes\2026-09-20-contact-only\start-your-order.html`
- Modify: `K:\PP Customs\Website\changes\2026-09-20-contact-only\check-page.js`
- Modify: `K:\PP Customs\Website\CHANGELOG.md`, `STATUS.md`, `changes/2026-09-20-contact-only/build-log.md`

**Interfaces:**
- Consumes: `POST https://orders.powerplaycustoms.ca/api/intake` (body per Task 2's `IntakeInput`, plus `website`), `GET https://orders.powerplaycustoms.ca/api/intake/<token>` → `{ready}`.

- [ ] **Step 1: Update the checks first** (`check-page.js`)

Change: `check("two forms", forms.length === 2 …)` → three; the per-form loop's `tag` becomes `["ready","scratch","reorder"][i]` and the Starting Point expectation `["Design ready","Starting from scratch","Ordered before"][i]`; add per form `check(tag + ": honeypot", /name="website"/.test(f))`; add `check("reorder form has Previous Order and What's Changed, others do not", /contact\[Previous Order\]/.test(forms[2]||"") && /contact\[What's Changed\]/.test(forms[2]||"") && !/contact\[Previous Order\]/.test(forms[0]||"") && !/contact\[Previous Order\]/.test(forms[1]||""))`; "what happens next" counts become `=== 3`; add `check("hand-off present", /orders\.powerplaycustoms\.ca\/api\/intake/.test(h) && /keepalive/.test(h))`; add `check("upload button present but hidden by default", /id="ppo-upload"/.test(h))`. Run it → FAIL against the current source (expected).

- [ ] **Step 2: The third card and form** (`start-your-order.html`)

Cards: change `.ppo .ppo-cards{grid-template-columns:1fr 1fr` → `repeat(3,1fr)` and add a tablet rule `@media screen and (max-width:989px){.ppo .ppo-cards{grid-template-columns:1fr}}`; add after the second card:

```html
        <a class="ppo-card" href="#form-reorder" data-route="reorder">
          <span class="ppo-card__eyebrow">Option 3</span>
          <span class="ppo-card__title">We've ordered before</span>
          <span class="ppo-card__text">Same design, new season. Tell us what's changed and we'll have the quote back today.</span>
          <span class="ppo-card__cta">Start here →</span>
        </a>
```

After the scratch form's closing `</div>`, the third form — a copy of the scratch form with: `id="form-reorder" data-route="reorder"`, `action="/contact#form-reorder"`, `id="contact_form_reorder"`, `contact[Starting Point]` value `Ordered before`, title `We've ordered before`, sub `Tell us the team and what's changed. We've got the design; you'll get the quote back today.`, field ids prefixed `o-`, no Team Colours / Inspiration / Artwork fields, and instead (before "Anything else"):

```html
          <div class="ppo-field"><label class="ppo-label" for="o-prev">Previous order</label><input class="ppo-input" id="o-prev" type="text" name="contact[Previous Order]" placeholder="Team name and roughly when, or the invoice number"></div>
          <div class="ppo-field"><label class="ppo-label" for="o-changed">What's changed <small>— optional</small></label><input class="ppo-input" id="o-changed" type="text" name="contact[What's Changed]" placeholder="New players, new sponsor, different sizes…"></div>
```

In all three forms, directly after the hidden `contact[Starting Point]` input, the honeypot:
```html
        <div class="ppo-hp" aria-hidden="true"><label for="hp-ready">Website</label><input id="hp-ready" type="text" name="website" tabindex="-1" autocomplete="off"></div>
```
(ids `hp-ready`, `hp-scratch`, `hp-reorder`) with CSS `.ppo .ppo-hp{position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden}`.

Script: `forms` gains `reorder: document.getElementById('form-reorder')`; `shared` gains `'contact[Previous Order]'`? No — it is route-specific; leave `shared` as is.

Success panel: after its `<p>` add
```html
    <a class="ppo-submit ppo-upload" id="ppo-upload" href="#" hidden style="max-width:520px;margin:18px auto 0">Upload your logos and inspiration now →</a>
```
(the same gold button style; `hidden` until the Draft is confirmed.)

- [ ] **Step 3: The hand-off** — replace the existing `submit` listener block with:

```js
  var INTAKE = 'https://orders.powerplaycustoms.ca/api/intake';
  function hex64() {
    var a = new Uint8Array(32); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function val(form, n) { var el = form.querySelector('[name="' + n + '"]'); return el ? String(el.value || '').trim() : ''; }
  function addHidden(form, n, v) { var i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.value = v; form.appendChild(i); }
  function intakeBody(form, token) {
    var items = [];
    ['Jerseys', 'Socks', 'Pant shells'].forEach(function (k) { var c = form.querySelector('[name="contact[' + k + ']"]'); if (c && c.checked) items.push(k); });
    return {
      rosterToken: token, startingPoint: val(form, 'contact[Starting Point]'), customerName: val(form, 'contact[Customer Name]'),
      email: val(form, 'contact[email]'), teamName: val(form, 'contact[Team Name]'), phone: val(form, 'contact[Phone Number]'),
      league: val(form, 'contact[Team League/Level]'), quantity: val(form, 'contact[Estimated Quantity]'), timeline: val(form, 'contact[Order Timeline]'),
      jerseyStyle: val(form, 'contact[Jersey Style]'), items: items, artworkStatus: val(form, 'contact[Artwork Status]'),
      colours: val(form, 'contact[Team Colours]'), inspiration: val(form, 'contact[Inspiration]'),
      extraDetails: [val(form, "contact[What's Changed]"), val(form, 'contact[Extra Details]')].filter(Boolean).join(' — '),
      previousOrder: val(form, 'contact[Previous Order]'), website: val(form, 'website')
    };
  }
  // At the real submit: hand the enquiry to the order manager without waiting
  // (keepalive survives the navigation), and leave empty optional fields out
  // of the Shopify post so the email lists only what was filled in.
  root.addEventListener('submit', function (e) {
    var form = e.target;
    if (form.dataset.handoff) return;
    form.dataset.handoff = '1';
    var token = hex64();
    var body = intakeBody(form, token);
    if (!body.website && window.fetch) {
      addHidden(form, 'contact[Upload link]', 'https://orders.powerplaycustoms.ca/roster/' + token);
      addHidden(form, 'contact[Order manager]', 'https://orders.powerplaycustoms.ca/orders?search=' + encodeURIComponent(body.teamName));
      var rt = form.querySelector('[name="return_to"]');
      if (rt) rt.value = location.pathname + '?sent=1&roster=' + token;
      try {
        fetch(INTAKE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true, mode: 'cors' }).catch(function () {});
      } catch (err) {}
    }
    var fields = form.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), select, textarea');
    for (var i = 0; i < fields.length; i++) {
      if (!fields[i].required && !String(fields[i].value).trim()) fields[i].disabled = true;
    }
  }, true);
  window.addEventListener('pageshow', function () {
    var d = root.querySelectorAll('[disabled]');
    for (var i = 0; i < d.length; i++) d[i].disabled = false;
    var f = root.querySelectorAll('form[data-handoff]');
    for (var j = 0; j < f.length; j++) delete f[j].dataset.handoff;
  });
```

And in the `is-sent` branch, after `root.classList.add('is-sent')`:

```js
    var tok = q.get('roster');
    if (tok && /^[0-9a-f]{64}$/.test(tok) && window.fetch) {
      var btn = document.getElementById('ppo-upload'); var tries = 0;
      (function poll() {
        fetch(INTAKE + '/' + tok, { mode: 'cors' }).then(function (r) { return r.json(); }).then(function (j) {
          if (j && j.ready) { btn.href = 'https://orders.powerplaycustoms.ca/roster/' + tok; btn.hidden = false; }
          else if (++tries < 4) setTimeout(poll, 2000);
        }).catch(function () { if (++tries < 4) setTimeout(poll, 2000); });
      })();
    }
```

Note `form.dataset.handoff` guards against Shopify's protection script re-dispatching submit: the second pass skips the hand-off (token already minted, fields already added) and just lets it through. The `?jersey=` preselect and the mirror code stay as they are.

- [ ] **Step 4: Static checks** — `node check-page.js start-your-order.html` → `PASS: 3 forms …`. Commit both files: `git -C "K:/PP Customs/Website" commit -am "Order page: third route, honeypots, hand-off to the order manager"`.

- [ ] **Step 5: Paste and save** (the routine from the earlier plan): clipboard via PowerShell `Get-Content -Raw -Encoding utf8 … | Set-Clipboard`; admin page 98227552465; click the toolbar's Show HTML via JS (`[...document.querySelectorAll('button')].find(b=>/show html/i.test(b.getAttribute('aria-label')||''))`), focus the CodeMirror view (`document.querySelector('.cm-content').cmView.view.focus()`), `ctrl+a`, `ctrl+v`, verify `view.state.doc.length` equals the file's character count, click the *visible* Save button by JS, confirm the Discard button is gone. Then `curl` the live page and run `check-page.js live.html --live` → PASS.

- [ ] **Step 6: The real test — a genuine click** — in Chrome on the live page: pick **We've ordered before**, fill name `TEST E — please ignore (Claude)`, email `info@powerplaycustoms.ca`, team `Test Team — ignore`, quantity `8`, previous order `test`, then a **real** click on Send. Expected: the page returns with `?sent=1&roster=<token>`, the success panel shows and within ~2 s the **Upload your logos and inspiration now →** button appears; clicking it opens the manager page titled "Same design, new season" asking for roster and details. Gmail shows the enquiry with `Upload link:` and `Order manager:` lines. Record the token and the outcome in the build log.

- [ ] **Step 7: Phone width and contrast** — built-in browser pane at 375 × 812: three cards stack, no element past the right edge, the hidden honeypot is off-screen; the contrast script from the earlier plan (Task 3 step 4 there) → `[]`.

- [ ] **Step 8: Log** — CHANGELOG row `#118`: the third card and form, honeypots, hand-off, upload button; undo = re-paste commit 8f46612's source through the code view. STATUS line; build log. Commit.

---

### Task 8: Wrap-up

- [ ] **Step 1: Manager docs and memory** — `docs/superpowers/plans/2026-09-20-website-intake.md` boxes ticked; the memory files `project-powerplay-website-fixes.md` (the page now hands off to the manager) and the manager project's memory (`C:\Users\keena\.claude\projects\C--Apps-powerplay-order-manager\memory\`) get a note on `/api/intake`, the env var and the three variants. Commit the manager repo; push.
- [ ] **Step 2: Tell Keenan** — the three URLs to try (the live page, a `roster` link for each route from three test enquiries, the order list under Drafts), which test Drafts to delete, and that the earlier plan's Task 7 (rollout to the other four builds) is still waiting on his go.

---

## Self-review

- **Spec coverage.** Endpoint + fields → Tasks 2–3; `enquiry` / `source` + `healOrder` → Task 1; guards (origin, honeypot, size, rate, dedupe) → Tasks 2–3; three routes / three pages → Task 4; badge + enquiry card, nothing on the share page → Task 5 (no `publicViewOf` change); website side (third card, honeypot, hand-off, success button, no-JS unchanged) → Task 7; success criteria 1–7 → Tasks 6–7 verification steps and the test files.
- **Placeholders.** None; every code step is written out. The one "check whether `text-fg` exists" is a real lookup step with its fallback stated.
- **Names.** `intakeOrder`, `parseIntake`, `draftPatch`, `findDuplicate`, `variantOf`, `ROUTE_COPY`, `WebsiteBadge`, `EnquiryCard`, `corsHeaders`/`originOf` (in `src/lib/intake-http.ts`, per the note in Task 3 step 6), `TOKEN_RE`, `INTAKE_ACTOR` — used with the same names throughout. The website's body keys match `IntakeInput` exactly, plus `website`.
- **Deviation from the spec, recorded in Task 1 step 6:** client-minted token + keepalive (because Shopify's protection needs a trusted submit), existence poll for the button, dedupe re-issues the token, `contact[Order manager]` is a search link.
