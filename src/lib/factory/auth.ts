import { cookies } from 'next/headers';
import { FACTORY_COOKIE, SESSION_COOKIE, isValidFactorySession, isValidSession } from '@/lib/session';

/**
 * Who is acting on the factory side. SERVER ONLY.
 *
 * The proxy already keeps anyone without the factory cookie (or Keenan's) off
 * /factory. Server actions are reachable by a direct POST, so every one of
 * them calls `requireFactory()` again — the proxy is the door, this is the
 * check at the desk.
 *
 * The name is whatever they typed at the door ("Michael"). It's a label for
 * Keenan's benefit — who moved the job, who asked — not an identity: one
 * shared passcode means anyone inside can type any name.
 */

export const FACTORY_NAME_COOKIE = 'ppc_factory_name';

export interface FactoryActor {
  name: string;
  /** Keenan looking at the factory's side with his own code. */
  isAdmin: boolean;
}

export function cleanFactoryName(raw: unknown): string {
  return String(raw ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export async function currentFactoryActor(): Promise<FactoryActor | null> {
  const jar = await cookies();
  const factory = await isValidFactorySession(jar.get(FACTORY_COOKIE)?.value);
  const admin = !factory && (await isValidSession(jar.get(SESSION_COOKIE)?.value));
  if (!factory && !admin) return null;
  const name = cleanFactoryName(jar.get(FACTORY_NAME_COOKIE)?.value);
  return { name: admin ? 'Keenan' : name || 'Factory', isAdmin: admin };
}

export class FactoryAuthError extends Error {
  constructor() {
    super('Sign in to the factory dashboard again.');
  }
}

export async function requireFactory(): Promise<FactoryActor> {
  const actor = await currentFactoryActor();
  if (!actor) throw new FactoryAuthError();
  return actor;
}
