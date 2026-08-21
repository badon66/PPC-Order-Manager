import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, isValidSession } from '@/lib/session';

/**
 * The lock on the front door.
 *
 * In Next 16 this file is `proxy.ts` (it was `middleware.ts` before). It runs
 * before every matched request, so an unlocked visitor never reaches a page,
 * a server action, or an API route — not just "the UI doesn't render it".
 *
 * PUBLIC, deliberately:
 *   /unlock      the code entry page itself
 *   /share/...   customer's read-only order view
 *   /roster/...  customer's roster submission form
 *   /api/public-upload/<token>  file uploads from that form (token-gated itself)
 *
 * Both customer routes are addressed by a long random per-order token rather
 * than the database id, so they can't be guessed and can be rotated per order.
 *
 * EVERYTHING ELSE needs the code. That includes contact details, shipping
 * addresses, the order list, and every write.
 */

const PUBLIC_PREFIXES = ['/unlock', '/share/', '/roster/', '/api/public-upload/'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSession(cookie)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/unlock';
  // Come back to where they were headed once they're in.
  url.searchParams.set('next', pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own assets and the favicon. Without this, the lock
  // would also block the CSS and JS the unlock page needs to render.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads/).*)'],
};
