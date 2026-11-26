/**
 * The factory door's lockout (Keenan, 2026-11-25: its own passcode, not full
 * login, but nobody should get in by sitting and guessing).
 *
 * Pure: state in, state out. The store keeps the state (it has to outlive a
 * serverless function), src/app/factory/unlock/actions.ts drives it.
 *
 *   per device   5 wrong codes inside 15 minutes locks that address out for
 *                15 minutes.
 *   everyone     30 wrong codes from anywhere inside 15 minutes closes the
 *                door to new sign-ins for 15 minutes — so rotating addresses
 *                doesn't buy more guesses. People already signed in are not
 *                affected.
 *
 * "Device" is a hash of the caller's address; nothing here stores an IP.
 */

export const GATE_WINDOW_MS = 15 * 60 * 1000;
export const GATE_MAX_PER_KEY = 5;
export const GATE_MAX_GLOBAL = 30;

export interface GateState {
  /** Wrong-code times (ms) per device key, inside the window. */
  fails: Record<string, number[]>;
  /** Locked-until (ms) per device key. */
  locked: Record<string, number>;
  /** Every wrong-code time (ms) from anywhere, inside the window. */
  all: number[];
  /** Locked-until (ms) for all new sign-ins. */
  globalUntil: number;
}

export const EMPTY_GATE: GateState = { fails: {}, locked: {}, all: [], globalUntil: 0 };

/** Whatever was stored, as a usable state; anything stale dropped. */
export function healGate(raw: unknown, now: number): GateState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<GateState>;
  const fails: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(r.fails ?? {})) {
    const kept = (Array.isArray(v) ? v : []).filter((t) => typeof t === 'number' && now - t < GATE_WINDOW_MS);
    if (kept.length) fails[k] = kept;
  }
  const locked: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.locked ?? {})) if (typeof v === 'number' && v > now) locked[k] = v;
  const globalUntil = typeof r.globalUntil === 'number' && r.globalUntil > now ? r.globalUntil : 0;
  const all = (Array.isArray(r.all) ? r.all : []).filter((t) => typeof t === 'number' && now - t < GATE_WINDOW_MS);
  return { fails, locked, all, globalUntil };
}

/** ms until this device may try again; 0 when it may try now. */
export function lockedFor(state: GateState, key: string, now: number): number {
  const until = Math.max(state.locked[key] ?? 0, state.globalUntil);
  return until > now ? until - now : 0;
}

/** The state after one wrong code from `key`. */
export function afterFailure(state: GateState, key: string, now: number): GateState {
  const s = healGate(state, now);
  const mine = [...(s.fails[key] ?? []), now];
  const fails = { ...s.fails, [key]: mine };
  const locked = { ...s.locked };
  if (mine.length >= GATE_MAX_PER_KEY) {
    locked[key] = now + GATE_WINDOW_MS;
    delete fails[key];
  }
  let all = [...s.all, now];
  let globalUntil = s.globalUntil;
  if (all.length >= GATE_MAX_GLOBAL) {
    globalUntil = now + GATE_WINDOW_MS;
    all = [];
  }
  return { fails, locked, all, globalUntil };
}

/** The state after `key` got in: its strikes are forgiven. */
export function afterSuccess(state: GateState, key: string, now: number): GateState {
  const s = healGate(state, now);
  const fails = { ...s.fails };
  delete fails[key];
  return { ...s, fails };
}

/** How many tries `key` has left before it's locked out. */
export function triesLeft(state: GateState, key: string, now: number): number {
  return Math.max(0, GATE_MAX_PER_KEY - (healGate(state, now).fails[key]?.length ?? 0));
}

/** The shortest passcode the factory door accepts as configured. A 4-digit code is 10,000 guesses; this isn't. */
export const FACTORY_CODE_MIN_LENGTH = 8;
