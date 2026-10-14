import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { FACTORY_COOKIE, SESSION_COOKIE, isValidFactorySession, isValidSession } from '@/lib/session';
import { SURFACE_HEADER, surfaceFor } from '@/lib/surface';

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
 *   /api/share/<token>/...  downloads off the share sheet (token-gated itself)
 *   /api/intake  website enquiries coming in (origin-gated; see src/lib/data/intake-logic.ts)
 *
 * Both customer routes are addressed by a long random per-order token rather
 * than the database id, so they can't be guessed and can be rotated per order.
 *
 * THE FACTORY'S DOOR, separate from both:
 *   /factory/unlock          the factory code entry page
 *   /factory/<token>         the manufacturer's sheet for one order
 *   /api/factory/<token>/... downloads off that sheet
 * These need the factory cookie (Michael's code — see lib/session.ts), or
 * Keenan's admin cookie, so he can open what Michael sees without a second
 * login. The token alone is not enough: a factory link forwarded on still
 * stops at the code. And the factory cookie opens nothing else — the admin
 * side below never looks at it.
 *
 * EVERYTHING ELSE needs the admin code. That includes contact details,
 * shipping addresses, the order list, and every write.
 */

const PUBLIC_PREFIXES = ['/unlock', '/share/', '/roster/', '/api/public-upload/', '/api/intake', '/api/share/'];

const FACTORY_UNLOCK = '/factory/unlock';
const FACTORY_PREFIXES = ['/factory/', '/api/factory/'];

/**
 * Pass the request on, telling the root layout which kind of screen this is
 * (see lib/surface.ts). Set here, where public-ness is already decided, so the
 * admin pages can scale up for Keenan's monitor and the customer pages never
 * do. Overwrites anything a client sent under that name.
 */
function next(request: NextRequest, isPublic: boolean) {
  const headers = new Headers(request.headers);
  headers.set(SURFACE_HEADER, surfaceFor(request.nextUrl.pathname, isPublic));
  return NextResponse.next({ request: { headers } });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p))) {
    return next(request, true);
  }

  // The factory's sheets are a public SURFACE (standard size, whatever Michael
  // opens them on) behind their own code.
  if (pathname === FACTORY_UNLOCK) return next(request, true);
  if (FACTORY_PREFIXES.some((p) => pathname.startsWith(p))) {
    const factory = request.cookies.get(FACTORY_COOKIE)?.value;
    const admin = request.cookies.get(SESSION_COOKIE)?.value;
    if ((await isValidFactorySession(factory)) || (await isValidSession(admin))) {
      return next(request, true);
    }
    const url = request.nextUrl.clone();
    url.pathname = FACTORY_UNLOCK;
    url.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSession(cookie)) return next(request, false);

  const url = request.nextUrl.clone();
  url.pathname = '/unlock';
  // Come back to where they were headed once they're in.
  url.searchParams.set('next', pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own assets and the site's own artwork. Without
  // this, the lock would also block the CSS and JS the unlock page needs to
  // render. /icons is public artwork the website loads (the other-sports icons
  // on the home page); /brand is the wordmark and shield every page shows,
  // and icon.png / apple-icon.png are the site icons browsers fetch on their
  // own — a customer on a share link has no session, and the logo must still
  // load for them.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|uploads/|icons/|brand/).*)'],
};
