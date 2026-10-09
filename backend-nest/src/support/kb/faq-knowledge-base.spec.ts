import {
  FAQ_KB_VERSION,
  FAQ_KNOWLEDGE_BASE,
  FAQ_TOP_KEYS,
  LEGACY_SEED_QUESTIONS,
  OBSOLETE_FAQ_PATTERN,
} from './faq-knowledge-base';
import { FAQ_ANSWER_MIN_SCORE, rankFaqs, scoreFaq } from './faq-retrieval';
import { FAQ_CATEGORIES } from '../constants/support.constants';
import { PROMOTE_CATALOG } from '../../listings/promote-catalog';
import { WEEKLY_FREE_BOOSTS_DEFAULT } from '../../subscriptions/perks/subscriber-perks';
import { TRIAL_DAYS } from '../../lib/subscription-lifecycle';
import { MAX_PROFILE_LINKS } from '../../users/lib/profile-links';
import { UPLOAD_MAX_MB } from '../../shared/lib/upload-limits';
import {
  legacyFaqIdsToRetire,
  SupportSeedService,
  FAQ_KB_VERSION_SETTING_KEY,
} from '../services/support-seed.service';
import { FaqService, parseServiceStatus } from '../services/faq.service';

const KB = FAQ_KNOWLEDGE_BASE.map((f) => ({ ...f, id: f.key }));
const byKey = new Map(FAQ_KNOWLEDGE_BASE.map((f) => [f.key, f]));

describe('help-center knowledge base', () => {
  it('is large, keyed uniquely and uses known categories', () => {
    expect(FAQ_KNOWLEDGE_BASE.length).toBeGreaterThanOrEqual(80);
    expect(FAQ_KNOWLEDGE_BASE.length).toBeLessThanOrEqual(130);
    expect(new Set(FAQ_KNOWLEDGE_BASE.map((f) => f.key)).size).toBe(
      FAQ_KNOWLEDGE_BASE.length,
    );
    for (const f of FAQ_KNOWLEDGE_BASE) {
      expect(FAQ_CATEGORIES).toContain(f.category);
      expect(f.keywords.length).toBeGreaterThan(0);
      if (f.actionRoute) {
        expect(f.actionRoute).toMatch(/^\//);
        expect(f.actionLabel).toBeTruthy();
      }
    }
    for (const k of FAQ_TOP_KEYS) expect(byKey.has(k)).toBe(true);
  });

  it('has no delivery / butcher / legacy-tab or old-bot-name content', () => {
    for (const f of FAQ_KNOWLEDGE_BASE) {
      const text = [f.questionAr, f.answerAr, ...f.keywords].join(' ');
      expect(text).not.toMatch(OBSOLETE_FAQ_PATTERN);
      expect(text).not.toContain('سرحان');
      expect(text).not.toContain('الإنternet');
    }
  });

  it('quotes prices and perks from the code sources of truth', () => {
    const prices = byKey.get('promo-prices')!.answerAr;
    for (const row of PROMOTE_CATALOG) {
      expect(prices).toContain(`${row.amount} ر.س`);
    }
    const weekly = byKey.get('promo-free-weekly')!.answerAr;
    expect(WEEKLY_FREE_BOOSTS_DEFAULT.blue_plus).toBe(2);
    expect(WEEKLY_FREE_BOOSTS_DEFAULT.gold).toBe(4);
    expect(weekly).toMatch(/تعزيزين/);
    expect(weekly).toMatch(/أربعة/);
    expect(byKey.get('sub-trial')!.answerAr).toContain(`${TRIAL_DAYS} أيام`);
    expect(byKey.get('acc-profile-links')!.answerAr).toContain(
      `${MAX_PROFILE_LINKS} روابط`,
    );
    const media = byKey.get('com-media-limits')!.answerAr;
    expect(media).toContain(`${UPLOAD_MAX_MB.image} ميجابايت`);
    expect(media).toContain(`${UPLOAD_MAX_MB.video} ميجابايت`);
    expect(media).toContain(`${UPLOAD_MAX_MB.audio} ميجابايت`);
    expect(byKey.get('sub-plans')!.answerAr).toMatch(/29.*59.*99/s);
  });
});

describe('FAQ retrieval (synonyms + trigram)', () => {
  const cases: Array<[string, string]> = [
    ['ما جاني الكود', 'acc-otp-missing'],
    ['ابي اميز اعلاني', 'promo-how'],
    ['وش فرق الذهبي', 'sub-compare'],
    ['ابي استرجع فلوسي', 'pay-refund-request'],
    ['كيف احذف حسابي', 'acc-delete'],
    ['البائع يبي عربون', 'safe-deposit'],
    ['نصبوا علي', 'safe-scammed'],
    ['كيف افتح مجلس', 'council-create'],
    ['كم متحدث بالمجلس', 'council-speakers'],
    ['كيف اغير اليوزر', 'acc-username'],
    ['التطبيق بطيء', 'tech-slow'],
    ['الوضع الليلي', 'tech-dark-mode'],
    ['مين شاف ملفي', 'sub-profile-views'],
    ['كم سعر التثبيت', 'promo-prices'],
    ['انخصم مني مرتين', 'pay-double'],
    ['ما تجيني اشعارات', 'tech-notifications'],
    ['كيف اسوي ستوري', 'com-story'],
    ['ليش ما اقدر اعدل اعلاني', 'ads-edit-again'],
    ['كم اعلان انشر باليوم', 'ads-daily-limit'],
    ['كيف احظر واحد يزعجني', 'safe-block'],
  ];

  it.each(cases)('«%s» → %s', (query, key) => {
    const [best] = rankFaqs(query, KB, { limit: 1 });
    expect(best?.faq.key).toBe(key);
    expect(best.score).toBeGreaterThanOrEqual(FAQ_ANSWER_MIN_SCORE);
  });

  it('tolerates spelling variants (hamza / taa marbuta / alef maqsura)', () => {
    const a = scoreFaq('ما وصلني رمز التحقق', byKey.get('acc-otp-missing')! as never);
    const b = scoreFaq('ما وصلنى رمز التحقق', byKey.get('acc-otp-missing')! as never);
    expect(b).toBeCloseTo(a, 2);
  });

  it('returns nothing for empty or pure-greeting queries', () => {
    expect(rankFaqs('', KB)).toEqual([]);
    expect(rankFaqs('السلام عليكم', KB)).toEqual([]);
  });
});

describe('knowledge-base seeding', () => {
  it('retires only legacy-seed or delivery-worded rows', () => {
    const ids = legacyFaqIdsToRetire([
      { id: 'a', questionAr: LEGACY_SEED_QUESTIONS[0], answerAr: 'x' },
      { id: 'b', questionAr: 'سؤال من الإدارة', answerAr: 'جواب' },
      { id: 'c', questionAr: 'وين المندوب؟', answerAr: 'x' },
      { id: 'd', questionAr: 'كيف أشاهد', answerAr: 'من تبويب «بث» تشاهد' },
    ]);
    expect(ids.sort()).toEqual(['a', 'c', 'd']);
  });

  function repoMock(version: unknown) {
    return {
      getAppSetting: jest.fn().mockResolvedValue(version == null ? null : { value: version }),
      upsertFaqByKey: jest.fn().mockResolvedValue({}),
      listActiveUnkeyedFaqs: jest.fn().mockResolvedValue([
        { id: 'old-1', questionAr: LEGACY_SEED_QUESTIONS[13], answerAr: 'x' },
        { id: 'admin-1', questionAr: 'سؤال مخصص', answerAr: 'y' },
      ]),
      deactivateFaqs: jest.fn().mockResolvedValue({ count: 1 }),
      upsertAppSetting: jest.fn().mockResolvedValue({}),
    };
  }

  it('upserts every entry by key, soft-retires legacy rows, records the version', async () => {
    const repo = repoMock(null);
    const result = await new SupportSeedService(repo as never).seedKnowledgeBase();
    expect(repo.upsertFaqByKey).toHaveBeenCalledTimes(FAQ_KNOWLEDGE_BASE.length);
    expect(repo.deactivateFaqs).toHaveBeenCalledWith(['old-1']);
    expect(repo.upsertAppSetting).toHaveBeenCalledWith(
      FAQ_KB_VERSION_SETTING_KEY,
      FAQ_KB_VERSION,
      expect.any(String),
    );
    expect(result).toEqual({ upserted: FAQ_KNOWLEDGE_BASE.length, retired: 1 });
  });

  it('is idempotent: does nothing once the version is seeded (admin edits kept)', async () => {
    const repo = repoMock(FAQ_KB_VERSION);
    expect(await new SupportSeedService(repo as never).seedKnowledgeBase()).toBeNull();
    expect(repo.upsertFaqByKey).not.toHaveBeenCalled();
    expect(repo.deactivateFaqs).not.toHaveBeenCalled();
  });

  it('never throws at boot when the DB is not migrated yet', async () => {
    const repo = { getAppSetting: jest.fn().mockRejectedValue(new Error('column key')) };
    await expect(new SupportSeedService(repo as never).onModuleInit()).resolves.toBeUndefined();
  });
});

describe('FaqService (search, top questions, service status)', () => {
  const rows = KB.map((f, i) => ({
    ...f,
    id: `id-${i}`,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }));
  const repo = {
    listActiveFaqsForRetrieval: jest.fn().mockResolvedValue(rows),
    getAppSetting: jest.fn(),
    upsertAppSetting: jest.fn(),
  };
  const svc = new FaqService(repo as never);

  it('ranks natural-language search instead of literal contains', async () => {
    const res = await svc.listPublic({ search: 'ما جاني الكود' });
    expect(res.faqs[0].key).toBe('acc-otp-missing');
    expect(res.faqs[0]).toHaveProperty('actionRoute');
  });

  it('returns curated top questions', async () => {
    const res = await svc.listPublic({ top: '5' });
    expect(res.faqs.map((f) => f.key)).toEqual(FAQ_TOP_KEYS.slice(0, 5));
  });

  it('filters by the new categories', async () => {
    const res = await svc.listPublic({ category: 'COUNCILS' });
    expect(res.faqs.length).toBeGreaterThan(5);
    expect(res.faqs.every((f) => f.category === 'COUNCILS')).toBe(true);
  });

  it('defaults the service status line', () => {
    expect(parseServiceStatus(undefined, null)).toEqual({
      state: 'ok',
      textAr: 'كل الخدمات تعمل بشكل طبيعي',
      updatedAt: null,
    });
    expect(parseServiceStatus({ state: 'degraded', textAr: 'تأخير في الرسائل' }, null).state).toBe('degraded');
  });

  it('requires a message when marking the service degraded', async () => {
    await expect(svc.setServiceStatus({ state: 'degraded' })).rejects.toBeTruthy();
    repo.upsertAppSetting.mockResolvedValue({ value: { state: 'ok', textAr: 'كل الخدمات تعمل بشكل طبيعي' }, updatedAt: new Date() });
    const ok = await svc.setServiceStatus({ state: 'ok' });
    expect(ok.textAr).toBe('كل الخدمات تعمل بشكل طبيعي');
  });
});
