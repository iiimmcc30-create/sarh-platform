import { Injectable } from '@nestjs/common';
import {
  LIVESTOCK_DICTIONARY_VERSION,
  LIVESTOCK_TERM_ENTRIES,
  TERM_SOURCES,
} from './data';
import { LivestockDictionary } from './livestock-dictionary';

let shared: LivestockDictionary | null = null;

/** Build (once per process) the in-memory index from the bundled data modules. */
export function getLivestockDictionary(): LivestockDictionary {
  if (!shared || shared.version !== LIVESTOCK_DICTIONARY_VERSION) {
    shared = new LivestockDictionary(
      LIVESTOCK_TERM_ENTRIES,
      TERM_SOURCES,
      LIVESTOCK_DICTIONARY_VERSION,
    );
  }
  return shared;
}

/**
 * Near-static dictionary: no DB or Redis read per search. The index is built
 * lazily once per process; the data version is part of search cache keys, so
 * a data update (deploy) invalidates cached search / suggest payloads.
 */
@Injectable()
export class LivestockDictionaryService {
  get(): LivestockDictionary {
    return getLivestockDictionary();
  }

  get version(): string {
    return LIVESTOCK_DICTIONARY_VERSION;
  }
}
