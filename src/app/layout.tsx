import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, isValidSession } from '@/lib/session';
import { lock } from './unlock/actions';
import './globals.css';

export const metadata: Metadata = {
  title: 'Powerplay Customs — Order Manager',
  description: 'Internal order management for Powerplay Customs.',
};

function Wordmark() {
  return (
    <span className="text-lg font-black tracking-tight">
      <span className="text-ppc-gold">POWERPLAY</span>
      <span className="ml-1.5 align-middle text-[0.6rem] font-bold tracking-[0.25em] text-muted">
        CUSTOMS
      </span>
    </span>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Customers land here through a share or roster link with no session, so they
  // get the wordmark and nothing else — no nav into the admin side.
  const jar = await cookies();
  const unlocked = await isValidSession(jar.get(SESSION_COOKIE)?.value);

  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-40 border-b border-ppc-gold/40 bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href={unlocked ? '/orders' : '#'} className="shrink-0">
              <Wordmark />
            </Link>

            {unlocked && (
              <nav className="flex items-center gap-1 text-sm">
                <Link
                  href="/orders"
                  className="rounded-lg px-3 py-2 font-semibold text-muted hover:bg-surface-2 hover:text-ppc-gold"
                >
                  Orders
                </Link>
                <Link
                  href="/queue"
                  className="rounded-lg px-3 py-2 font-semibold text-muted hover:bg-surface-2 hover:text-ppc-gold"
                >
                  Production
                </Link>
                <form action={lock}>
                  <button
                    type="submit"
                    className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted hover:border-red-500/50 hover:text-red-300"
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
