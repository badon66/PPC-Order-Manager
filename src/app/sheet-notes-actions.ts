'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { repo } from '@/lib/data';
import { cleanNoteInput, type PageNote } from '@/lib/page-notes';
import { notifyNewNote } from '@/lib/note-notify';
import { FACTORY_COOKIE, SESSION_COOKIE, isValidFactorySession, isValidSession } from '@/lib/session';

/**
 * Leaving a note on a sheet (lib/page-notes.ts).
 *
 * The team's sheet: no session — the share token is the credential, as for
 * the sign-off. The factory's: its token AND the factory code's cookie (or
 * Keenan's), exactly what opening that sheet takes. Either way the note is
 * cleaned (strings, capped), appended to history, and Keenan is emailed.
 */

async function save(sheet: 'team' | 'factory', token: string, raw: unknown): Promise<{ ok: boolean; note?: PageNote; error?: string }> {
  const input = cleanNoteInput(raw);
  if (!input) return { ok: false, error: 'Write a note first.' };
  const saved = await repo.addPageNote({ sheet, token: String(token ?? '') }, input);
  if (!saved) return { ok: false, error: "That note couldn't be saved. Reload the page and try again." };
  await notifyNewNote(saved.orderId, saved.teamName, saved.note);
  revalidatePath(`/orders/${saved.orderId}`);
  return { ok: true, note: saved.note };
}

export async function addTeamNote(token: string, raw: unknown) {
  return save('team', token, raw);
}

export async function addFactoryNote(token: string, raw: unknown) {
  const jar = await cookies();
  const allowed =
    (await isValidFactorySession(jar.get(FACTORY_COOKIE)?.value)) || (await isValidSession(jar.get(SESSION_COOKIE)?.value));
  if (!allowed) return { ok: false, error: 'Enter the factory code again, then leave the note.' };
  return save('factory', token, raw);
}
