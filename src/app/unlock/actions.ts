'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SESSION_COOKIE, codeMatches, mintSessionValue, sessionMaxAgeSeconds,
} from '@/lib/session';

/** Slows down anyone trying codes in bulk. Cheap, and there's no user to annoy. */
const WRONG_CODE_DELAY_MS = 600;

export async function unlock(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const submitted = String(formData.get('code') ?? '');
  const next = String(formData.get('next') ?? '/orders');

  if (!submitted.trim()) return { error: 'Enter the access code.' };

  if (!codeMatches(submitted)) {
    await new Promise((r) => setTimeout(r, WRONG_CODE_DELAY_MS));
    return { error: 'That code is not right.' };
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await mintSessionValue(), {
    httpOnly: true,               // JavaScript in the page cannot read it
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionMaxAgeSeconds(),
  });

  // Only ever bounce to a path on this site.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/orders');
}

export async function lock() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect('/unlock');
}
