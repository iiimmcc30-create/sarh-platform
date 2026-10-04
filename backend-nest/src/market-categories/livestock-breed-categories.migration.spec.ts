import { readFileSync } from 'fs';
import path from 'path';
import { BREED_TERMS } from '../search/terms/data/breeds.terms';
import { getLivestockDictionary } from '../search/terms/livestock-dictionary.service';
import { isValidListingCategory } from '../listings/listing-categories';

const MIGRATION = path.join(
  __dirname,
  '../../prisma/migrations/20261004230000_livestock_breed_categories/migration.sql',
);
const sql = readFileSync(MIGRATION, 'utf8').replace(/\r\n/g, '\n');

type Row = {
  id: string;
  nameAr: string;
  slug: string;
  sortOrder: number;
  legacy: string;
};

const rows: Row[] = [
  ...sql.matchAll(
    /\('([0-9a-f-]{36})', '([^']+)', '[^']+', '([a-z0-9-]+)', '[^']+', (\d+), '([a-z]+)'\)/g,
  ),
].map((m) => ({
  id: m[1],
  nameAr: m[2],
  slug: m[3],
  sortOrder: Number(m[4]),
  legacy: m[5],
}));

describe('migration 20261004230000_livestock_breed_categories', () => {
  const code = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

  it('is additive and idempotent (parent by slug, ON CONFLICT DO NOTHING, no update/delete)', () => {
    expect(code).toContain('INSERT INTO "MarketCategory"');
    expect(code).toContain(
      `JOIN "MarketCategory" AS p ON p.slug = 'livestock' AND p."parentId" IS NULL`,
    );
    expect(code.trim().endsWith('ON CONFLICT DO NOTHING;')).toBe(true);
    expect(code).not.toMatch(/\b(UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i);
    // The parent id is resolved by slug, never hardcoded.
    expect(code).not.toContain('a1000000-0000-4000-8000-000000000001');
  });

  it('adds 29 breed subcategories with unique ids / slugs and valid legacy species', () => {
    expect(rows).toHaveLength(29);
    expect(new Set(rows.map((r) => r.id)).size).toBe(29);
    expect(new Set(rows.map((r) => r.slug)).size).toBe(29);
    const counts = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.legacy] = (acc[r.legacy] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ camels: 11, sheep: 6, goats: 10, cows: 2 });
    for (const r of rows) {
      expect(isValidListingCategory(r.legacy)).toBe(true);
      expect(r.id.startsWith('a3000000-0000-4000-8000-')).toBe(true);
      expect(r.sortOrder).toBeGreaterThanOrEqual(10);
    }
  });

  it('never reuses a slug from the original taxonomy seed', () => {
    const seed = readFileSync(
      path.join(
        __dirname,
        '../../prisma/migrations/20260812140000_market_categories/migration.sql',
      ),
      'utf8',
    );
    for (const r of rows) expect(seed).not.toContain(`'${r.slug}'`);
  });

  it('every breed name comes from the search dictionary breed list', () => {
    const breeds = new Set(
      BREED_TERMS.filter((e) =>
        e.meanings.some((m) => m.category === 'breed'),
      ).map((e) => e.canonical),
    );
    for (const r of rows) {
      expect(breeds.has(r.nameAr.split(' ').slice(1).join(' '))).toBe(true);
    }
  });
});

describe('dictionary: market age / state words added for search', () => {
  const dict = getLivestockDictionary();

  it.each(['لبون', 'فطيم', 'حوار', 'مفرود', 'سخل', 'حولي', 'سديس', 'رضيع'])(
    '"%s" is an age stage',
    (word) => {
      expect(dict.lookup(word).some((m) => m.category === 'age_stage')).toBe(
        true,
      );
    },
  );

  it('"حائل" spelling maps to حايل (state) and keeps the place sense', () => {
    const hits = dict.lookup('حائل');
    expect(hits.some((m) => m.category === 'reproductive_status')).toBe(true);
    expect(hits.some((m) => m.category === 'general' && !m.searchable)).toBe(
      true,
    );
  });

  it('ambiguous words (حق / لقي) keep a general sense', () => {
    for (const word of ['حق', 'لقي']) {
      const hits = dict.lookup(word);
      expect(hits.some((m) => m.category === 'age_stage')).toBe(true);
      expect(hits.some((m) => m.category === 'general' && !m.searchable)).toBe(
        true,
      );
    }
  });

  it('camel states / types: خلفة, عشراء, ذلول, هجن', () => {
    for (const word of ['خلفة', 'عشراء']) {
      expect(
        dict.lookup(word).some((m) => m.category === 'reproductive_status'),
      ).toBe(true);
    }
    for (const word of ['ذلول', 'هجن']) {
      expect(
        dict.lookup(word).some((m) => m.animalTypes?.includes('camel')),
      ).toBe(true);
    }
  });
});
