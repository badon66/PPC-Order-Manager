import { jsonStore } from './json-store';
import type { Repository } from './repository';

/**
 * The single place storage is chosen.
 *
 * Today: a JSON file, so the app runs with no database and no accounts.
 * Later: `export const repo: Repository = supabaseStore` — nothing else changes,
 * because no page or component imports a store directly.
 */
export const repo: Repository = jsonStore;

export type { Repository, Actor, OrderBundle, OrderListFilters, PublicOrderView } from './repository';
