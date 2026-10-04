import { readFileSync } from 'fs';
import path from 'path';
import { MARKET_CATEGORIES_FALLBACK } from '@/lib/marketCategoriesFallback';

const MIGRATION = path.join(
  __dirname,
  '../../backend-nest/prisma/migrations/20261004230000_livestock_breed_categories/migration.sql',
);

describe('livestock breed categories: app fallback mirrors the DB migration', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const dbRows = [
    ...sql.matchAll(
      /\('([0-9a-f-]{36})', '([^']+)', '[^']+', '([a-z0-9-]+)', '([^']+)', (\d+), '([a-z]+)'\)/g,
    ),
  ].map((m) => ({
    id: m[1],
    nameAr: m[2],
    slug: m[3],
    emoji: m[4],
    sortOrder: Number(m[5]),
    legacyCategory: m[6],
  }));
  const livestock = MARKET_CATEGORIES_FALLBACK.find((c) => c.slug === 'livestock')!;
  const children = livestock.children ?? [];
  const breeds = children.filter((c) => c.id.startsWith('a3000000-'));

  it('keeps the original livestock children first and unchanged', () => {
    expect(children.slice(0, 7).map((c) => [c.id, c.slug, c.sortOrder])).toEqual([
      ['a2000000-0000-4000-8000-000000000001', 'camels', 0],
      ['a2000000-0000-4000-8000-000000000002', 'sheep', 1],
      ['a2000000-0000-4000-8000-000000000003', 'goats', 2],
      ['a2000000-0000-4000-8000-000000000004', 'cows', 3],
      ['a2000000-0000-4000-8000-000000000005', 'horses', 4],
      ['a2000000-0000-4000-8000-000000000006', 'birds', 5],
      ['a2000000-0000-4000-8000-000000000007', 'livestock-other', 6],
    ]);
  });

  it('has the same 29 breed rows (id, name, slug, emoji, order, legacy species)', () => {
    expect(dbRows).toHaveLength(29);
    expect(
      breeds.map((c) => ({
        id: c.id,
        nameAr: c.nameAr,
        slug: c.slug,
        emoji: c.emoji,
        sortOrder: c.sortOrder,
        legacyCategory: c.legacyCategory,
      })),
    ).toEqual(dbRows);
    for (const b of breeds) {
      expect(b.parentId).toBe(livestock.id);
      expect(b.isActive).toBe(true);
      expect(b.requiresWeight).toBe(false);
    }
  });

  it('ids and slugs stay unique across the whole taxonomy', () => {
    const all = MARKET_CATEGORIES_FALLBACK.flatMap((p) => [p, ...(p.children ?? [])]);
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    expect(new Set(all.map((c) => c.slug)).size).toBe(all.length);
  });
});
