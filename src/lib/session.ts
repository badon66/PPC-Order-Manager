/**
 * Access-code session.
 *
 * The whole admin side of the app sits behind one code that Keenan knows.
 * Share links and client roster links stay public — they're protected by an
 * unguessable per-order token instead.
 *
 * THE RULE THIS EXISTS TO ENFORCE: the code never reaches the browser. It lives
 * in an environment variable, is compared on the server, and what the browser
 * gets back is a signed, httpOnly cookie it can't read or forge.
 *
 * The Base44 app did the opposite — it shipped the code inside the public
 * JavaScript bundle and set a plain `localStorage` flag, so anyone could read
 * the code in devtools or just set the flag by hand. That is the single biggest
 * reason this rebuild exists.
 *
 * Uses Web Crypto so the same code runs in the proxy (edge) runtime and in
 * server actions.
 */

const COOKIE_NAME = 'ppc_session';
const SESSION_DAYS = 14;

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
 * Where the access code comes from.
 *
 *   1. ADMIN_ACCESS_CODE in the environment  — use this once it's hosted.
 *   2. admin-code.txt in the project root    — the local convenience path.
 *
 * Both are read on the server only. `admin-code.txt` is gitignored and, like
 * the env var, never reaches the browser — Next 16's proxy runs on the Node
 * runtime, so a plain file read works everywhere the check happens.
 *
 * The file exists because editing a dotfile on Windows is a nuisance and the
 * env-var route needed a manual step every time. This one is just a text file.
 */
function readCodeFile(): string | null {
  try {
    // Required lazily so the bundler doesn't pull fs into anything client-side.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const raw = fs.readFileSync(path.join(process.cwd(), 'admin-code.txt'), 'utf8');
    const code = raw.split('\n')[0].trim();
    return code || null;
  } catch {
    return null;
  }
}

export function configuredCode(): string | null {
  const fromEnv = process.env.ADMIN_ACCESS_CODE?.trim();
  if (fromEnv) return fromEnv;
  return readCodeFile();
}

/** True when there's no code set at all — the app shows a setup screen instead of crashing. */
export function isConfigured(): boolean {
  return configuredCode() !== null;
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
