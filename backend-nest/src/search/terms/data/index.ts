import type { LivestockTermEntry, TermSource } from '../livestock-terms.types';
import { BADIA_SHAM_2024_TERMS } from './badia-sham-2024.terms';
import { BREED_TERMS } from './breeds.terms';
import { CORE_LIVESTOCK_TERMS } from './core-livestock.terms';
import { TERM_SOURCES } from './sources';

/**
 * Bump when any data module changes: it is part of the search / suggest Redis
 * cache keys, so an update invalidates cached results automatically.
 */
export const LIVESTOCK_DICTIONARY_VERSION = '2026-10-04.1';

/** Add new regions / animal types / sources as new data modules here. */
export const LIVESTOCK_TERM_ENTRIES: readonly LivestockTermEntry[] = [
  ...CORE_LIVESTOCK_TERMS,
  ...BREED_TERMS,
  ...BADIA_SHAM_2024_TERMS,
];

export { TERM_SOURCES };
export type { TermSource };
