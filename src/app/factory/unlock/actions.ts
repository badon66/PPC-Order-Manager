'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  FACTORY_COOKIE, factoryCodeMatches, factorySessionMaxAgeSeconds, isFactoryConfigured,
  mintFactorySessionValue,
} from '@/lib/session';

/** Slows down anyone trying codes in bulk. Cheap, and there's no user to annoy. */
const WRONG_CODE_DELAY_MS = 600;

/** Only ever bounce to a factory page on this site — never into the admin side. */
function safeNext(next: string): string {
  return next.startsWith('/factory/') && !next.startsWith('//') && next !== '/factory/unlock'
    ? next
    : '/factory/unlock?ok=1';
}

export async function unlockFactory(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const submitted = String(formData.get('code') ?? '');
  const next = String(formData.get('next') ?? '');

  if (!isFactoryConfigured()) {
    return { error: 'The factory code is not set up yet. Powerplay needs to set FACTORY_ACCESS_CODE (different from the admin code).' };
  }
  if (!submitted.trim()) return { error: 'Enter the factory code.' };

  if (!factoryCodeMatches(submitted)) {
    await new Promise((r) => setTimeout(r, WRONG_CODE_DELAY_MS));
    return { error: 'That code is not right.' };
  }

  const jar = await cookies();
  jar.set(FACTORY_COOKIE, await mintFactorySessionValue(), {
    httpOnly: true,               // JavaScript in the page cannot read it
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',                    // one cookie; the proxy decides what it opens
    maxAge: factorySessionMaxAgeSeconds(),
  });

  redirect(safeNext(next));
}

export async function lockFactory() {
  const jar = await cookies();
  jar.delete(FACTORY_COOKIE);
  redirect('/factory/unlock');
}
