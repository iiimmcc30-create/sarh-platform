import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { SaudiCitiesDataset } from './saudi-city-matcher';
import { SaudiCityMatcher } from './saudi-city-matcher';

export const SAUDI_CITIES_FILE = join('assets', 'geo', 'saudi-cities.json');

/** assets/ sits next to dist/ in the image and next to src/ in the repo. */
function datasetPath(): string {
  const candidates = [
    resolve(process.cwd(), SAUDI_CITIES_FILE),
    resolve(__dirname, '..', '..', '..', SAUDI_CITIES_FILE),
    resolve(__dirname, '..', '..', '..', '..', SAUDI_CITIES_FILE),
  ];
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error(`saudi-cities.json not found (${candidates.join(', ')})`);
  return hit;
}

let cached: SaudiCitiesDataset | null = null;
let cachedMatcher: SaudiCityMatcher | null = null;

export function loadSaudiCitiesDataset(): SaudiCitiesDataset {
  if (!cached) {
    cached = JSON.parse(readFileSync(datasetPath(), 'utf8')) as SaudiCitiesDataset;
  }
  return cached;
}

export function saudiCityMatcher(): SaudiCityMatcher {
  if (!cachedMatcher) cachedMatcher = new SaudiCityMatcher(loadSaudiCitiesDataset());
  return cachedMatcher;
}
