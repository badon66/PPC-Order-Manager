import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { SURFACE_HEADER, asSurface } from '@/lib/surface';
import { SESSION_COOKIE, isValidSession } from '@/lib/session';
import { lock } from './unlock/actions';
import './globals.css';

export const metadata: Metadata = {
  title: 'Powerplay Customs — Order Manager',
  description: 'Internal order management for Powerplay Customs.',
};

/**
 * The real wordmark, top left on every page — Keenan's, the customer's and
 * the factory's. public/brand/wordmark.png is the Powerplay Customs logo with
 * its white background cut away; the shield badge is the site icon
 * (src/app/icon.png, apple-icon.png, favicon.ico). Height in rem so it scales
 * with the admin side on the ultrawide and stays standard everywhere else.
 */
function Wordmark() {
  return (
    <Image
      src="/brand/wordmark.png"
      alt="Powerplay Customs"
      width={1600}
      height={425}
      priority
      className="h-7 w-auto sm:h-9"
    />
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Customers land here through a share or roster link with no session, so they
  // get the wordmark and nothing else — no nav into the admin side.
  const jar = await cookies();
  const unlocked = await isValidSession(jar.get(SESSION_COOKIE)?.value);
  // Stamped on <html> so globals.css can scale the admin side for the
  // ultrawide and leave the customer pages at standard size. See lib/surface.ts.
  const surface = asSurface((await headers()).get(SURFACE_HEADER));

  return (
    <html lang="en" data-surface={surface}>
      <body>
        <header className="sticky top-0 z-40 border-b border-ppc-gold/40 bg-background">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-4">
            <Link href={unlocked ? '/orders' : '#'} className="shrink-0">
              <Wordmark />
            </Link>

            {unlocked && (
              <nav className="flex min-w-0 items-center gap-0.5 text-sm sm:gap-1">
                <Link
                  href="/orders"
                  className="rounded-lg px-2 py-2 font-semibold text-muted hover:bg-surface-2 hover:text-ppc-gold sm:px-3"
                >
                  Orders
                </Link>
                <Link
                  href="/queue"
                  className="rounded-lg px-2 py-2 font-semibold text-muted hover:bg-surface-2 hover:text-ppc-gold sm:px-3"
                >
                  {/* Short on a phone: the whole header has to fit in 390px or the page zooms out. */}
                  <span className="sm:hidden">Queue</span>
                  <span className="hidden sm:inline">Production</span>
                </Link>
                <Link
                  href="/sales"
                  className="rounded-lg px-2 py-2 font-semibold text-muted hover:bg-surface-2 hover:text-ppc-gold sm:px-3"
                >
                  Sales
                </Link>
                <Link
                  href="/settings"
                  className="rounded-lg px-2 py-2 font-semibold text-muted hover:bg-surface-2 hover:text-ppc-gold sm:px-3"
                >
                  <span aria-label="Settings" className="sm:hidden">⚙</span>
                  <span className="hidden sm:inline">Settings</span>
                </Link>
                <form action={lock}>
                  <button
                    type="submit"
                    className="rounded-lg border border-line px-2 py-2 text-xs font-semibold text-muted hover:border-red-500/50 hover:text-red-300 sm:px-3"
                  >
                    Lock
                  </button>
                </form>
              </nav>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 pb-20">{children}</main>
      </body>
    </html>
  );
}
