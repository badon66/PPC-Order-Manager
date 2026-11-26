import Link from 'next/link';
import { currentFactoryActor } from '@/lib/factory/auth';
import { FACTORY_TEXT as T } from '@/lib/factory/text';
import { lockFactory } from './unlock/actions';

/**
 * The factory's side of the app. Wide (`.factory-wide`, see globals.css):
 * Michael is on a desktop and the dashboard is a board plus two side lists,
 * so it uses the width instead of scrolling. One slim bar: where you are,
 * who you are, sign out. Nothing here links into Keenan's side.
 */
export default async function FactoryLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentFactoryActor();
  return (
    <div className="factory-wide space-y-4">
      {actor && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <Link href="/factory" className="text-xs font-bold uppercase tracking-[0.2em] text-ppc-gold hover:underline">
            {T.brand}
          </Link>
          <div className="flex items-center gap-3 text-xs text-muted">
            <Link href="/factory" className="font-semibold hover:text-ppc-gold">{T.jobs}</Link>
            <span>
              {actor.isAdmin ? 'Viewing as Powerplay' : actor.name}
            </span>
            {!actor.isAdmin && (
              <form action={lockFactory}>
                <button type="submit" className="font-semibold hover:text-ppc-gold">{T.signOut}</button>
              </form>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
