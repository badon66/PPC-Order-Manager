import { headers } from 'next/headers';

/**
 * The address to put in a link that leaves this app.
 *
 * Only two things use it — Copy Share Link and Copy Client Form Link — but
 * both produce a URL that gets emailed to a customer, so a wrong value isn't a
 * cosmetic bug. It's a dead link in someone's inbox, and you don't find out
 * until they say so.
 *
 * The old version was `process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'`,
 * which fails in the quietest possible way: forget the variable in production
 * and every link you hand a customer points at your own laptop. It looks
 * correct on your screen, because on your screen localhost IS the app.
 *
 * So the fallback is now the request's own host rather than a hardcoded guess.
 * A link copied from the deployed site carries the deployed domain, a link
 * copied from a preview build carries the preview domain, and a link copied on
 * a laptop still says localhost — but only because that genuinely is where you
 * are, not because a variable is missing.
 *
 * NEXT_PUBLIC_BASE_URL still wins when it's set, and setting it is still worth
 * doing: it's what makes a link copied from `npm run dev` point at the real
 * site instead of a laptop that isn't serving anyone. Point it at production
 * in both `.env.local` and Vercel.
 */
export async function baseUrl(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  // x-forwarded-* is what a proxy sets; Vercel does. `host` covers running
  // directly. Both are request-scoped, so this can't be hoisted to module
  // level — that's why it's a function and not a constant.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return 'http://localhost:3000';

  const proto =
    h.get('x-forwarded-proto') ??
    (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) ? 'http' : 'https');

  return `${proto}://${host}`;
}

/** True when a copied link would only work on the machine that copied it. */
export function isLocalUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);
}
