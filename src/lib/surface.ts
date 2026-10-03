/**
 * Which kind of screen a request is for.
 *
 *   public  a customer or the manufacturer, on whatever they have. /share,
 *           /roster, /unlock. Standard size for everybody, always.
 *   admin   Keenan, on his 3440px ultrawide. Orders, Production, Settings.
 *           Scales up and widens on big screens (globals.css).
 *   sales   the calling screen only (/sales/<list>/call). It has its own
 *           full-height, no-scroll layout tuned at 100% (globals.css,
 *           .call-screen) and is left alone. The Sales list pages are admin.
 *
 * Decided in the proxy, which already knows which routes are public (that's
 * the lock), and carried to the root layout as a request header so <html>
 * can be stamped server-side: no flash, no second list of public routes to
 * keep in step.
 */

export const SURFACE_HEADER = 'x-ppc-surface';

export type Surface = 'public' | 'admin' | 'sales';

export function surfaceFor(pathname: string, isPublic: boolean): Surface {
  if (isPublic) return 'public';
  if (/^\/sales\/[^/]+\/call(\/|$)/.test(pathname)) return 'sales';
  return 'admin';
}

export function asSurface(v: string | null | undefined): Surface {
  // Missing means the proxy didn't run. Standard size is the safe guess.
  return v === 'admin' || v === 'sales' ? v : 'public';
}
