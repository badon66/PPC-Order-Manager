import { jsonStore } from './json-store';
import { supabaseStore } from './supabase-store';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { Repository } from './repository';

/**
 * The single place storage is chosen.
 *
 * Supabase when it's configured, the local JSON file otherwise. No page or
 * component imports a store directly, so this is the whole switch.
 *
 * Chosen by whether the environment has credentials rather than by an explicit
 * flag, because the failure modes of a flag are bad in both directions: a
 * hosted app pointed at a JSON file writes to a disk that vanishes on the next
 * deploy, and a local dev session pointed at Supabase edits live customer
 * data. Presence of the service-role key is the honest signal — Vercel has it,
 * a laptop normally doesn't.
 *
 * To work against Supabase locally on purpose, put the two variables in
 * .env.local. To go back, comment them out.
 */
export const repo: Repository = isSupabaseConfigured() ? supabaseStore : jsonStore;

/** Which backend is live. Used by the rescue page and the migration script. */
export const backend: 'supabase' | 'json' = isSupabaseConfigured() ? 'supabase' : 'json';

export type { Repository, Actor, OrderBundle, OrderListFilters, PublicOrderView } from './repository';
