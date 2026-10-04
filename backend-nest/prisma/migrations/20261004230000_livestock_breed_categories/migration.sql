-- Livestock breeds as subcategories of the existing «المواشي» root (two-level tree:
-- breeds sit next to إبل / أغنام / ماعز / أبقار). Names come from the reviewed search
-- dictionary (backend-nest/src/search/terms/data/breeds.terms.ts).
--
-- Additive + idempotent, safe on production data:
--   * the parent is resolved by its slug ('livestock'), never by a hardcoded id;
--   * no row is updated, renamed or deleted;
--   * ON CONFLICT DO NOTHING skips any slug (or id) that already exists, so re-running
--     inserts nothing; if the livestock root is missing, nothing is inserted.
-- legacyCategory keeps the species so the legacy listing enum / species filters still work.
-- Fixed ids mirror the app fallback (app/lib/marketCategoriesFallback.ts).
INSERT INTO "MarketCategory" ("id", "nameAr", "nameEn", "slug", "icon", "emoji", "parentId", "sortOrder", "isActive", "requiresWeight", "legacyCategory", "createdAt", "updatedAt")
SELECT v.id, v.name_ar, v.name_en, v.slug, 'paw', v.emoji, p.id, v.sort_order, true, false, v.legacy, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  VALUES
  ('a3000000-0000-4000-8000-000000000001', 'إبل مجاهيم', 'Majaheem camels', 'camel-majaheem', '🐪', 10, 'camels'),
  ('a3000000-0000-4000-8000-000000000002', 'إبل مغاتير', 'Maghateer camels', 'camel-maghateer', '🐪', 11, 'camels'),
  ('a3000000-0000-4000-8000-000000000003', 'إبل وضح', 'Wadh camels', 'camel-wadh', '🐪', 12, 'camels'),
  ('a3000000-0000-4000-8000-000000000004', 'إبل صفر', 'Sufr camels', 'camel-sufr', '🐪', 13, 'camels'),
  ('a3000000-0000-4000-8000-000000000005', 'إبل شعل', 'Shuel camels', 'camel-shuel', '🐪', 14, 'camels'),
  ('a3000000-0000-4000-8000-000000000006', 'إبل حمر', 'Humr camels', 'camel-humr', '🐪', 15, 'camels'),
  ('a3000000-0000-4000-8000-000000000007', 'إبل شقح', 'Shuqh camels', 'camel-shuqh', '🐪', 16, 'camels'),
  ('a3000000-0000-4000-8000-000000000008', 'إبل عمانية', 'Omani camels', 'camel-omani', '🐪', 17, 'camels'),
  ('a3000000-0000-4000-8000-000000000009', 'إبل كنانية', 'Kinaniya camels', 'camel-kinaniya', '🐪', 18, 'camels'),
  ('a3000000-0000-4000-8000-000000000010', 'إبل آركية', 'Arkiya camels', 'camel-arkiya', '🐪', 19, 'camels'),
  ('a3000000-0000-4000-8000-000000000011', 'إبل حرائر', 'Haraer camels', 'camel-haraer', '🐪', 20, 'camels'),
  ('a3000000-0000-4000-8000-000000000012', 'أغنام نعيمي', 'Naemi sheep', 'sheep-naemi', '🐑', 30, 'sheep'),
  ('a3000000-0000-4000-8000-000000000013', 'أغنام نجدي', 'Najdi sheep', 'sheep-najdi', '🐑', 31, 'sheep'),
  ('a3000000-0000-4000-8000-000000000014', 'أغنام حري', 'Harri sheep', 'sheep-harri', '🐑', 32, 'sheep'),
  ('a3000000-0000-4000-8000-000000000015', 'أغنام سواكني', 'Sawakni sheep', 'sheep-sawakni', '🐑', 33, 'sheep'),
  ('a3000000-0000-4000-8000-000000000016', 'أغنام عواسي', 'Awassi sheep', 'sheep-awassi', '🐑', 34, 'sheep'),
  ('a3000000-0000-4000-8000-000000000017', 'أغنام عساف', 'Assaf sheep', 'sheep-assaf', '🐑', 35, 'sheep'),
  ('a3000000-0000-4000-8000-000000000018', 'ماعز عارضي', 'Ardi goats', 'goat-ardi', '🐐', 50, 'goats'),
  ('a3000000-0000-4000-8000-000000000019', 'ماعز نجدي', 'Najdi goats', 'goat-najdi', '🐐', 51, 'goats'),
  ('a3000000-0000-4000-8000-000000000020', 'ماعز حري', 'Harri goats', 'goat-harri', '🐐', 52, 'goats'),
  ('a3000000-0000-4000-8000-000000000021', 'ماعز حجازي', 'Hejazi goats', 'goat-hejazi', '🐐', 53, 'goats'),
  ('a3000000-0000-4000-8000-000000000022', 'ماعز جبلي', 'Jabali goats', 'goat-jabali', '🐐', 54, 'goats'),
  ('a3000000-0000-4000-8000-000000000023', 'ماعز بيشي', 'Bishi goats', 'goat-bishi', '🐐', 55, 'goats'),
  ('a3000000-0000-4000-8000-000000000024', 'ماعز حبسي', 'Habsi goats', 'goat-habsi', '🐐', 56, 'goats'),
  ('a3000000-0000-4000-8000-000000000025', 'ماعز تهامي', 'Tohami goats', 'goat-tohami', '🐐', 57, 'goats'),
  ('a3000000-0000-4000-8000-000000000026', 'ماعز نجراني', 'Najrani goats', 'goat-najrani', '🐐', 58, 'goats'),
  ('a3000000-0000-4000-8000-000000000027', 'ماعز شامي', 'Shami goats', 'goat-shami', '🐐', 59, 'goats'),
  ('a3000000-0000-4000-8000-000000000028', 'أبقار حساوي', 'Hassawi cows', 'cow-hassawi', '🐄', 70, 'cows'),
  ('a3000000-0000-4000-8000-000000000029', 'أبقار جنوبي', 'Janobi cows', 'cow-janobi', '🐄', 71, 'cows')
) AS v(id, name_ar, name_en, slug, emoji, sort_order, legacy)
JOIN "MarketCategory" AS p ON p.slug = 'livestock' AND p."parentId" IS NULL
ON CONFLICT DO NOTHING;
