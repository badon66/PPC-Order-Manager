import { cookies } from 'next/headers';
import type { AppUser, UserRole } from './types';
import type { Actor } from './data/repository';
import { SESSION_COOKIE, isValidSession } from './session';

/**
 * Authorization today: one shared access code.
 *
 * Anyone holding the code sees everything behind it — the order list, contact
 * details, shipping addresses, the lot. There is no per-person split, because
 * that's the model Keenan asked for right now.
 *
 * Enforcement is real: `src/proxy.ts` blocks unauthenticated requests before
 * any page, server action, or API route runs, and the code itself never leaves
 * the server. Compare that with the Base44 app, which put the code in the
 * public JS bundle and gated on a localStorage flag while its data API happily
 * served customer phone numbers to anyone who asked.
 *
 * WHAT A SHARED CODE COSTS, for whenever this gets revisited:
 *  - The change history can only say "someone with the code did this."
 *    Attribution is the main thing lost.
 *  - You can't revoke one person. A contractor leaving means a new code for
 *    everyone.
 *  - There's no way to give someone limited access.
 *
 * The fix is per-person email login, and the shape below (roles, an actor on
 * every write) is already built for it — this file is the only thing that
 * changes.
 */

const CODE_HOLDER: AppUser = {
  id: 'code-holder',
  email: 'keenanhuber99@gmail.com',
  name: 'Keenan Huber',
  role: 'admin',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

async function hasSession(): Promise<boolean> {
  const jar = await cookies();
  return isValidSession(jar.get(SESSION_COOKIE)?.value);
}

export async function currentUser(): Promise<AppUser | null> {
  return (await hasSession()) ? CODE_HOLDER : null;
}

export async function currentActor(): Promise<Actor> {
  const u = await currentUser();
  if (!u) throw new Error('Not authorised');
  return { email: u.email, name: u.name };
}

/**
 * Defence in depth. The proxy already turns unauthenticated requests away, but
 * server actions and route handlers call this too — so a future change to the
 * matcher can't quietly open a hole.
 */
export async function requireRole(_minimum: UserRole): Promise<AppUser> {
  const user = await currentUser();
  if (!user) throw new Error('Not authorised');
  return user;
}

export async function can(_action: 'edit_order' | 'delete_order' | 'manage_users'): Promise<boolean> {
  return hasSession();
}
