'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  FACTORY_COOKIE, factoryCodeMatches, factoryCodeProblem, factorySessionMaxAgeSeconds, keyedHash,
  mintFactorySessionValue,
} from '@/lib/session';
import { repo } from '@/lib/data';
import { afterFailure, afterSuccess, healGate, lockedFor, triesLeft } from '@/lib/factory/gate';
import { FACTORY_NAME_COOKIE, cleanFactoryName } from '@/lib/factory/auth';

/** Slows down anyone trying codes in bulk, on top of the lockout. */
const WRONG_CODE_DELAY_MS = 800;

/** Only ever bounce to a factory page on this site — never into the admin side. */
function safeNext(next: string): string {
  return (next === '/factory' || next.startsWith('/factory/')) && !next.startsWith('//') && !next.startsWith('/factory/unlock')
    ? next
    : '/factory';
}

/** The caller's address as a lockout key. Hashed: the store never holds an IP. */
async function deviceKey(): Promise<string> {
  const h = await headers();
  // On Vercel the platform sets this header itself; a client can't choose it.
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
  return keyedHash(ip);
}

const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

export async function unlockFactory(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const submitted = String(formData.get('code') ?? '');
  const name = cleanFactoryName(formData.get('name'));
  const next = String(formData.get('next') ?? '');

  const problem = factoryCodeProblem();
  if (problem) {
    return { error: 'The factory passcode is not set up yet. Ask Powerplay to set it.' };
  }
  if (!submitted.trim()) return { error: 'Enter the passcode.' };
  if (!name) return { error: 'Enter your name, so Powerplay knows who is asking.' };

  // Locked out? Refused BEFORE the code is even compared, so a correct guess
  // during a lockout tells an attacker nothing.
  const key = await deviceKey();
  const now = Date.now();
  const gate = healGate(await repo.getFactoryGate(), now);
  const wait = lockedFor(gate, key, now);
  if (wait > 0) {
    return { error: `Too many wrong tries. Try again in ${minutes(wait)} minute${minutes(wait) === 1 ? '' : 's'}.` };
  }

  if (!factoryCodeMatches(submitted)) {
    const after = afterFailure(gate, key, now);
    await repo.saveFactoryGate(after);
    await new Promise((r) => setTimeout(r, WRONG_CODE_DELAY_MS));
    const nowLocked = lockedFor(after, key, Date.now());
    if (nowLocked > 0) return { error: `Too many wrong tries. Try again in ${minutes(nowLocked)} minutes.` };
    const left = triesLeft(after, key, Date.now());
    return { error: `That passcode is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` };
  }

  if (gate.fails[key]) await repo.saveFactoryGate(afterSuccess(gate, key, now));

  const jar = await cookies();
  const cookie = {
    httpOnly: true,               // JavaScript in the page cannot read it
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',                    // one cookie; the proxy decides what it opens
    maxAge: factorySessionMaxAgeSeconds(),
  };
  jar.set(FACTORY_COOKIE, await mintFactorySessionValue(), cookie);
  // A label, not a credential: who to show Keenan as having moved a job.
  jar.set(FACTORY_NAME_COOKIE, name, cookie);

  redirect(safeNext(next));
}

export async function lockFactory() {
  const jar = await cookies();
  jar.delete(FACTORY_COOKIE);
  jar.delete(FACTORY_NAME_COOKIE);
  redirect('/factory/unlock');
}
