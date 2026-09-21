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
  // The roster is asked for on every route. The page opens it with "Is your
  // roster ready?", so a design-first team can say "not yet" in one tap and a
  // team that already has the list can send it on day one.
  return variantOf(sp) === 'reorder'
    ? { logos: false, inspiration: false, roster: true, personalDetails: true }
    : { logos: true, inspiration: true, roster: true, personalDetails: false };
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
