import type { ChangeLogEntry, FactoryRates, Order } from '@/lib/types';
import { setBuilds } from '@/lib/order-utils';

/**
 * What Powerplay owes the factory (Keenan, 2026-11-25).
 *
 * THE ONLY MONEY THE FACTORY EVER SEES IS ITS OWN: what it charges for a job,
 * what Powerplay has sent it, what's still owed. Never a customer's price,
 * never Powerplay's profit — those are worked out on Keenan's pages only
 * (`profitOf` here is called from nowhere the factory can reach).
 *
 * Stored like every factory move (lib/factory/steps.ts): append-only history
 * entries, the state worked out from them. Nothing here writes the order row.
 *   factory_cost          the factory's total for the job, USD     toValue = cents
 *   factory_shipping      extra shipping on top, USD               toValue = cents
 *   factory_payment       Powerplay sent money                     toValue = cents, field = payment id
 *   factory_payment_void  Powerplay took a payment back off        field = payment id
 * A payment sent "to the balance" is split across jobs when it's recorded —
 * one entry per job, all carrying the same payment id — so every job's paid
 * amount is simply the sum of its own entries.
 *
 * ALL AMOUNTS ARE WHOLE CENTS (integers). Dollars only when shown.
 */

export const MONEY_ACTIONS = ['factory_cost', 'factory_shipping', 'factory_payment', 'factory_payment_void'] as const;

/** The largest amount one box accepts: $1,000,000. A typo guard, not a business rule. */
export const MAX_CENTS = 100_000_000;

/** "1,250.50" / "$1250" / "1250.5" → cents. null when it isn't a plain amount. */
export function parseMoney(raw: unknown): number | null {
  const s = String(raw ?? '').replace(/[$,\s]/g, '');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null;
}

const centsOf = (v: string | null | undefined): number => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_CENTS ? n : 0;
};

/** 125050 → "$1,250.50". Whole dollars drop the cents. */
export function usd(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  const frac = abs % 100;
  return `${neg ? '−' : ''}$${whole}${frac ? `.${String(frac).padStart(2, '0')}` : ''}`;
}

/** For an input box: 125050 → "1250.50". */
export const centsToInput = (cents: number | null): string => (cents === null ? '' : (cents / 100).toFixed(2).replace(/\.00$/, ''));

export interface JobPayment {
  /** The payment this is part of (shared by every job one lump sum was split across). */
  paymentId: string;
  cents: number;
  at: string;
  by: string;
  note: string;
}

export interface JobMoney {
  /** The factory's total for the job. null = not entered yet. */
  cost: number | null;
  /** Extra shipping on top (0 = shipping is included). */
  shipping: number;
  /** cost + shipping. */
  total: number;
  paid: number;
  /** total − paid. Negative = Powerplay has paid ahead on this job. */
  balance: number;
  /** Half the total until the job is finished, then all of it; less what's paid. Never below 0. */
  dueNow: number;
  /** True once the whole amount is due (Completed or Shipped, approved). */
  fullDue: boolean;
  costBy: string;
  costAt: string | null;
  payments: JobPayment[];
}

const byTime = (a: ChangeLogEntry, b: ChangeLogEntry) => a.at.localeCompare(b.at);

/**
 * One job's money, from that job's history.
 * `finished` = the job reached Completed or Shipped with Keenan's approval
 * (or Powerplay already moved the order past production): the full amount is
 * due. Before that, half.
 */
export function jobMoneyOf(history: ChangeLogEntry[], finished: boolean): JobMoney {
  let cost: number | null = null;
  let shipping = 0;
  let costBy = '';
  let costAt: string | null = null;
  const voided = new Set<string>();
  const payments: JobPayment[] = [];
  for (const h of [...history].sort(byTime)) {
    if (h.action === 'factory_cost') {
      cost = h.toValue === '' || h.toValue == null ? null : centsOf(h.toValue);
      costBy = h.actorName;
      costAt = h.at;
    } else if (h.action === 'factory_shipping') shipping = centsOf(h.toValue);
    else if (h.action === 'factory_payment' && h.field) {
      payments.push({ paymentId: h.field, cents: centsOf(h.toValue), at: h.at, by: h.actorName, note: h.fromValue ?? '' });
    } else if (h.action === 'factory_payment_void' && h.field) voided.add(h.field);
  }
  const live = payments.filter((p) => !voided.has(p.paymentId) && p.cents > 0);
  const total = (cost ?? 0) + shipping;
  const paid = live.reduce((n, p) => n + p.cents, 0);
  // Half, rounded UP to the cent: an odd cent is never left un-asked-for.
  const target = finished ? total : Math.ceil(total / 2);
  return {
    cost, shipping, total, paid,
    balance: total - paid,
    dueNow: Math.max(0, target - paid),
    fullDue: finished,
    costBy, costAt,
    payments: live.reverse(),
  };
}

export interface BalanceTotals {
  /** Everything not yet paid, across all jobs — less anything paid ahead. */
  outstanding: number;
  /** What's payable today under the half / full rule — less anything paid ahead. */
  dueNow: number;
  /** Paid ahead on jobs that cost less than was sent (or have no cost yet). */
  credit: number;
  paid: number;
  /** Jobs with no cost entered. */
  uncosted: number;
}

export function balanceTotals(jobs: Array<Pick<JobMoney, 'cost' | 'balance' | 'dueNow' | 'paid'>>): BalanceTotals {
  let owed = 0, due = 0, credit = 0, paid = 0, uncosted = 0;
  for (const j of jobs) {
    if (j.cost === null) uncosted += 1;
    if (j.balance >= 0) owed += j.balance;
    else credit += -j.balance;
    due += j.dueNow;
    paid += j.paid;
  }
  return {
    outstanding: Math.max(0, owed - credit),
    dueNow: Math.max(0, due - credit),
    credit, paid, uncosted,
  };
}

export interface PayableJob {
  orderId: string;
  /** Oldest first decides who is paid first: the day it was sent, then the id. */
  sentAt: string;
  balance: number;
  dueNow: number;
}

/**
 * Where a payment goes.
 *   A job named → all of it on that job (paying ahead is allowed there).
 *   No job      → what's DUE NOW first, oldest job first; then the rest of
 *                 what's outstanding, oldest first. So "Due now" drops by
 *                 what was sent. More than everything outstanding is refused
 *                 — there's no job to put the extra on; name one.
 */
export function allocatePayment(
  jobs: PayableJob[],
  cents: number,
  orderId: string | null,
): { ok: true; parts: Array<{ orderId: string; cents: number }> } | { ok: false; error: string } {
  if (!Number.isSafeInteger(cents) || cents <= 0) return { ok: false, error: 'Enter an amount above zero.' };
  if (cents > MAX_CENTS) return { ok: false, error: 'That amount is too large.' };
  if (orderId) {
    if (!jobs.some((j) => j.orderId === orderId)) return { ok: false, error: "That job isn't one the factory has." };
    return { ok: true, parts: [{ orderId, cents }] };
  }
  const order = [...jobs].sort((a, b) => (a.sentAt || '9999').localeCompare(b.sentAt || '9999') || a.orderId.localeCompare(b.orderId));
  const outstanding = order.reduce((n, j) => n + Math.max(0, j.balance), 0);
  if (cents > outstanding) {
    return {
      ok: false,
      error: outstanding === 0
        ? 'Nothing is outstanding right now. To pay ahead, pick the job it is for.'
        : `That is more than the ${usd(outstanding)} outstanding. Pick the job the extra is for, or send ${usd(outstanding)}.`,
    };
  }
  const given = new Map<string, number>();
  let left = cents;
  const give = (id: string, amount: number) => {
    const take = Math.min(left, amount);
    if (take <= 0) return;
    given.set(id, (given.get(id) ?? 0) + take);
    left -= take;
  };
  for (const j of order) give(j.orderId, Math.min(j.dueNow, Math.max(0, j.balance)));
  for (const j of order) give(j.orderId, Math.max(0, j.balance) - (given.get(j.orderId) ?? 0));
  return { ok: true, parts: [...given].map(([id, c]) => ({ orderId: id, cents: c })) };
}

/* ------------------------------------------------------------------ *
 * The cost check — KEENAN ONLY
 * ------------------------------------------------------------------ */

export const RATE_LABEL: Record<keyof FactoryRates, string> = {
  sublimatedJersey: 'Sublimated jersey',
  embroideredJersey: 'Embroidered jersey',
  reversibleJersey: 'Reversible jersey',
  sublimatedSocks: 'Sublimated socks (pair)',
  embroideredSocks: 'Embroidered socks (pair)',
  reversibleSocks: 'Reversible socks (pair)',
  sublimatedShells: 'Sublimated pant shell',
  embroideredShells: 'Embroidered pant shell',
};

const JERSEY_RATE: Record<string, keyof FactoryRates> = {
  sublimated: 'sublimatedJersey', embroidered: 'embroideredJersey', reversible_sublimated: 'reversibleJersey',
};
const SOCK_RATE: Record<string, keyof FactoryRates> = {
  sublimated: 'sublimatedSocks', embroidered: 'embroideredSocks', reversible_sublimated: 'reversibleSocks',
};
const SHELL_RATE: Record<string, keyof FactoryRates> = { sublimated: 'sublimatedShells', embroidered: 'embroideredShells' };

export interface ExpectedLine {
  label: string;
  qty: number;
  /** USD cents each; null = no standard rate set for this item. */
  each: number | null;
}

export interface ExpectedCost {
  lines: ExpectedLine[];
  /** Sum of the priced lines, cents. */
  cents: number;
  /** Items on the order with no standard rate — left out of the total. */
  unpriced: string[];
}

type CostInput = Pick<Order, 'sets' | 'jerseyType' | 'jerseyTier' | 'sockType' | 'pantShellType' | 'keeperJerseys'>;

/**
 * What the job should cost at the standard rates: every jersey, pair of socks
 * and pant shell being made (spares and Powerplay's keeper jerseys included —
 * the factory makes those too), each at its type's rate. An item with no type
 * chosen or no rate set is listed as unpriced and left out.
 */
export function expectedCostOf(o: CostInput, rates: FactoryRates): ExpectedCost {
  const qty = new Map<keyof FactoryRates | 'unknown', number>();
  const add = (key: keyof FactoryRates | undefined, n: number) => {
    if (n > 0) qty.set(key ?? 'unknown', (qty.get(key ?? 'unknown') ?? 0) + n);
  };
  const builds = setBuilds(o);
  o.sets.forEach((s, i) => {
    const b = builds[i];
    add(JERSEY_RATE[b.jerseyType ?? ''], (s.playerJerseys || 0) + (s.goalieJerseys || 0) + (s.extraJerseys || 0));
    add(SOCK_RATE[b.sockType ?? ''], b.socks);
    add(SHELL_RATE[b.pantShellType ?? ''], b.shells);
  });
  for (const k of o.keeperJerseys ?? []) add(JERSEY_RATE[builds[k.setIndex]?.jerseyType ?? builds[0]?.jerseyType ?? ''], 1);

  const lines: ExpectedLine[] = [];
  const unpriced: string[] = [];
  let cents = 0;
  for (const [key, n] of qty) {
    if (key === 'unknown') {
      unpriced.push(`${n} item${n === 1 ? '' : 's'} with no type chosen`);
      continue;
    }
    const rate = rates[key];
    const each = rate === null || rate === undefined ? null : Math.round(rate * 100);
    lines.push({ label: RATE_LABEL[key], qty: n, each });
    if (each === null) unpriced.push(`${n} × ${RATE_LABEL[key].toLowerCase()}`);
    else cents += n * each;
  }
  return { lines, cents, unpriced };
}

export type CostCheck =
  | { kind: 'none' }
  /** Nothing to compare against: every item is unpriced. */
  | { kind: 'unknown'; expected: ExpectedCost }
  | { kind: 'ok' | 'flag'; expected: ExpectedCost; diff: number; partial: boolean };

/**
 * The factory's cost against the standard rates. Extra shipping is NOT part of
 * the comparison. A difference of `flagAtCents` or more, either way, is a flag.
 * With unpriced items on the order the comparison is PARTIAL: the expected
 * figure covers only the priced items, and the rest can only add to it. So a
 * cost above it can't be judged (never flagged), and a cost BELOW it by the
 * threshold still is — that can't be right whatever the missing rates are.
 */
export function costCheck(cost: number | null, expected: ExpectedCost, flagAtCents: number): CostCheck {
  if (cost === null) return { kind: 'none' };
  if (expected.lines.every((l) => l.each === null)) return { kind: 'unknown', expected };
  const diff = cost - expected.cents;
  const partial = expected.unpriced.length > 0;
  const off = partial ? diff <= -flagAtCents : Math.abs(diff) >= flagAtCents;
  return { kind: off ? 'flag' : 'ok', expected, diff, partial };
}

/** Powerplay's profit on a job, in CAD cents: the customer's price less the factory's total. KEENAN ONLY. */
export function profitOf(orderValueCad: number | null, totalUsdCents: number, usdToCad: number | null): number | null {
  if (orderValueCad === null || usdToCad === null || totalUsdCents <= 0) return null;
  return Math.round(orderValueCad * 100) - Math.round(totalUsdCents * usdToCad);
}

/** USD cents shown in the chosen currency. */
export function inCurrency(cents: number, cur: 'usd' | 'cad', usdToCad: number | null): string {
  if (cur === 'cad' && usdToCad) return `${usd(Math.round(cents * usdToCad))} CAD`;
  return `${usd(cents)} USD`;
}
