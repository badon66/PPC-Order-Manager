import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase client, server-side only.
 *
 * Every table has RLS on with no policies, so the publishable key can read
 * nothing. The app uses the SERVICE ROLE key, which bypasses RLS entirely.
 *
 * That is a deliberate choice, and it comes with one rule: this module must
 * never be imported by a client component. The key is a master key to the
 * whole database. It has no `NEXT_PUBLIC_` prefix, so Next will not inline it
 * into a browser bundle — and if someone ever imports this file from a
 * component that runs in the browser, the build fails rather than shipping a
 * client with an undefined key and a mystery at runtime.
 *
 * Authorization lives in the app instead of in RLS policies: one shared access
 * code for the admin side (src/lib/session.ts), unguessable per-order tokens
 * for the two public pages. Per-person login would be the moment to move that
 * into policies.
 */

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function supabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, ' +
        'or unset them both to fall back to the local JSON store.',
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'ppc-order-manager' } },
  });
  return client;
}

/** The private bucket holding artwork. Created by supabase/migrations/0002. */
export const ARTWORK_BUCKET = 'artwork';
