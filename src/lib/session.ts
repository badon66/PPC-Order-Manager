/**
 * Access-code sessions.
 *
 * Two codes, two cookies, and they never mix:
 *
 *   admin    Keenan's code. The whole admin side of the app sits behind it.
 *            Cookie `ppc_session`, 14 days.
 *   factory  Michael's code. Opens /factory/<token> sheets and nothing else.
 *            Cookie `ppc_factory`, 30 days — he opens a sheet per job, not
 *            the app every day, and shouldn't be typing a code each time.
 *
 * Share links and client roster links stay public — they're protected by an
 * unguessable per-order token instead. The factory sheet has a token too, and
 * asks for the factory code on top: a forwarded factory link is not enough.
 *
 * THE RULE THIS EXISTS TO ENFORCE: a code never reaches the browser. It lives
 * in an environment variable, is compared on the server, and what the browser
 * gets back is a signed, httpOnly cookie it can't read or forge.
 *
 * The Base44 app did the opposite — it shipped the code inside the public
 * JavaScript bundle and set a plain `localStorage` flag, so anyone could read
 * the code in devtools or just set the flag by hand. That is the single biggest
 * reason this rebuild exists.
 *
 * The two cookies are signed with the same key, so the payload carries the
 * realm: an admin cookie signs a bare expiry, a factory cookie signs `f` plus
 * the expiry. Paste a factory cookie into the admin cookie's slot and the
 * admin check parses `f1700…` as not-a-number and refuses it; the reverse
 * fails the `f` check. Neither side can be promoted by renaming a cookie.
 *
 * Uses Web Crypto so the same code runs in the proxy (edge) runtime and in
 * server actions.
 */

const COOKIE_NAME = 'ppc_session';
const SESSION_DAYS = 14;
const FACTORY_COOKIE_NAME = 'ppc_factory';
const FACTORY_SESSION_DAYS = 30;
/** Realm tag on a factory cookie's signed payload. Never on an admin one. */
const FACTORY_TAG = 'f';

/**
 * Returns a plain ArrayBuffer rather than the Uint8Array TextEncoder gives you.
 * TypeScript's Web Crypto types want `BufferSource` backed by a real
 * ArrayBuffer, and `Uint8Array` is typed as possibly SharedArrayBuffer-backed.
 */
function enc(s: string): ArrayBuffer {
  const view = new TextEncoder().encode(s);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

function b64url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Where a code comes from.
 *
 *   1. The environment  — ADMIN_ACCESS_CODE / FACTORY_ACCESS_CODE. Use this
 *                         once it's hosted; on Vercel it's the only source.
 *   2. A file in the project root — admin-code.txt / factory-code.txt, the
 *                         local convenience path.
 *
 * Both are read on the server only. The files are gitignored and, like the
 * env vars, never reach the browser — Next 16's proxy runs on the Node
 * runtime, so a plain file read works everywhere the check happens.
 *
 * The files exist because editing a dotfile on Windows is a nuisance and the
 * env-var route needed a manual step every time. These are just text files.
 */
function readCodeFile(which: 'admin' | 'factory'): string | null {
  try {
    // Required lazily so the bundler doesn't pull fs into anything client-side.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    // Two literal names, not one variable: the build traces exactly these two
    // files. A path built from a variable made it bundle the whole project
    // into the server functions.
    const file = which === 'admin'
      ? path.join(process.cwd(), 'admin-code.txt')
      : path.join(process.cwd(), 'factory-code.txt');
    const raw = fs.readFileSync(file, 'utf8');
    const code = raw.split('\n')[0].trim();
    return code || null;
  } catch {
    return null;
  }
}

export function configuredCode(): string | null {
  const fromEnv = process.env.ADMIN_ACCESS_CODE?.trim();
  if (fromEnv) return fromEnv;
  return readCodeFile('admin');
}

/** True when there's no code set at all — the app shows a setup screen instead of crashing. */
export function isConfigured(): boolean {
  return configuredCode() !== null;
}

/**
 * The factory code. Null when it isn't set, and ALSO null when it's the same
 * as the admin code: a factory code that opens the admin side isn't a factory
 * code, it's the admin code handed out, so the sheet refuses to work until
 * they differ rather than quietly letting that stand.
 */
export function configuredFactoryCode(): string | null {
  const code = process.env.FACTORY_ACCESS_CODE?.trim() || readCodeFile('factory');
  if (!code) return null;
  const admin = configuredCode();
  if (admin && safeEqual(code, admin)) return null;
  return code;
}

export function isFactoryConfigured(): boolean {
  return configuredFactoryCode() !== null;
}

/**
 * Key used to sign the session cookie.
 *
 * Prefers an explicit SESSION_SECRET. If there isn't one, it derives a key from
 * the access code so the app works with a single line of setup — HMAC hashes
 * its key, so a derived key is still a proper key.
 *
 * Tradeoff, stated plainly: with the derived key, changing the access code also
 * invalidates every existing session. For a shared-code setup that's the
 * behaviour you want anyway — change the code, everyone gets logged out.
 * Set SESSION_SECRET explicitly before this is hosted anywhere public.
 */
function secret(): string {
  const explicit = process.env.SESSION_SECRET;
  if (explicit && explicit.length >= 16) return explicit;

  const code = configuredCode();
  if (!code) throw new Error('No access code configured.');
  return `${code}::ppc-session-derived-v1`;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return b64url(await crypto.subtle.sign('HMAC', key, enc(payload)));
}

/** Length-independent compare, so timing can't leak the signature. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const SESSION_COOKIE = COOKIE_NAME;

export function sessionMaxAgeSeconds(): number {
  return SESSION_DAYS * 24 * 60 * 60;
}

export async function mintSessionValue(): Promise<string> {
  const expires = Date.now() + sessionMaxAgeSeconds() * 1000;
  const payload = String(expires);
  return `${payload}.${await sign(payload)}`;
}

export async function isValidSession(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const dot = value.lastIndexOf('.');
  if (dot < 1) return false;

  const payload = value.slice(0, dot);
  const provided = value.slice(dot + 1);

  const expires = Number(payload);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;

  return safeEqual(provided, await sign(payload));
}

/**
 * Compares a submitted code against the configured one.
 * Trimmed, because a trailing space from a paste shouldn't read as "wrong code"
 * with no explanation — the old app had exactly that papercut.
 */
export function codeMatches(submitted: string): boolean {
  const expected = configuredCode();
  if (!expected) return false;
  return safeEqual(submitted.trim(), expected.trim());
}

/* ------------------------------------------------------------------ *
 * Factory realm
 * ------------------------------------------------------------------ */

export const FACTORY_COOKIE = FACTORY_COOKIE_NAME;

export function factorySessionMaxAgeSeconds(): number {
  return FACTORY_SESSION_DAYS * 24 * 60 * 60;
}

export async function mintFactorySessionValue(): Promise<string> {
  const expires = Date.now() + factorySessionMaxAgeSeconds() * 1000;
  const payload = `${FACTORY_TAG}${expires}`;
  return `${payload}.${await sign(payload)}`;
}

/** A factory cookie, and only a factory cookie: the realm tag is checked before the signature. */
export async function isValidFactorySession(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const dot = value.lastIndexOf('.');
  if (dot < 1) return false;

  const payload = value.slice(0, dot);
  const provided = value.slice(dot + 1);
  if (!payload.startsWith(FACTORY_TAG)) return false;

  const expires = Number(payload.slice(FACTORY_TAG.length));
  if (!Number.isFinite(expires) || expires < Date.now()) return false;

  return safeEqual(provided, await sign(payload));
}

export function factoryCodeMatches(submitted: string): boolean {
  const expected = configuredFactoryCode();
  if (!expected) return false;
  return safeEqual(submitted.trim(), expected.trim());
}
