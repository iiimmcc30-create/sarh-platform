import { Injectable } from '@nestjs/common';
import type { Faq } from '@prisma/client';
import { z } from 'zod';
import { throwApi } from '../../common/exceptions/api.exception';
import { SupportRepository } from '../repositories/support.repository';
import {
  FAQ_CATEGORIES,
  FAQ_CATEGORY_LABEL_AR,
  SERVICE_STATUS_DEFAULT_TEXT_AR,
  SERVICE_STATUS_SETTING_KEY,
  SERVICE_STATUS_STATES,
  type ServiceStatusState,
} from '../constants/support.constants';
import { FAQ_TOP_KEYS } from '../kb/faq-knowledge-base';
import {
  FAQ_SEARCH_MIN_SCORE,
  rankFaqs,
  type RankedFaq,
} from '../kb/faq-retrieval';

const faqQuerySchema = z.object({
  search: z.string().max(300).optional(),
  category: z.string().max(40).optional(),
  top: z.coerce.number().int().min(1).max(20).optional(),
});

/** In-app route like `/promote` or `/(tabs)/messages` (no scheme, no host). */
const actionRouteSchema = z
  .string()
  .trim()
  .max(200)
  .regex(/^\/[A-Za-z0-9_\-/()[\]?=&.]*$/, 'invalid_route');

const keywordsSchema = z
  .array(z.string().trim().min(1).max(120))
  .max(60)
  .transform((list) => [...new Set(list)]);

const createFaqSchema = z.object({
  questionAr: z.string().min(3).max(500),
  answerAr: z.string().min(3).max(5000),
  category: z.enum(FAQ_CATEGORIES),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  keywords: keywordsSchema.optional(),
  actionRoute: actionRouteSchema.nullable().optional(),
  actionLabel: z.string().trim().max(40).nullable().optional(),
});

const updateFaqSchema = createFaqSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'empty_update' });

const reorderSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int(),
    }),
  ),
});

const serviceStatusSchema = z.object({
  state: z.enum(SERVICE_STATUS_STATES),
  textAr: z.string().trim().max(160).optional(),
});

export type ServiceStatus = {
  state: ServiceStatusState;
  textAr: string;
  updatedAt: string | null;
};

const CACHE_TTL_MS = 60_000;

/** Public FAQ shape (no soft-delete bookkeeping). */
function toPublic(faq: Faq) {
  return {
    id: faq.id,
    key: faq.key ?? null,
    questionAr: faq.questionAr,
    answerAr: faq.answerAr,
    category: faq.category,
    sortOrder: faq.sortOrder,
    keywords: faq.keywords ?? [],
    actionRoute: faq.actionRoute ?? null,
    actionLabel: faq.actionLabel ?? null,
  };
}

export type PublicFaq = ReturnType<typeof toPublic>;

@Injectable()
export class FaqService {
  private cache: { at: number; faqs: Faq[] } | null = null;

  constructor(private readonly repo: SupportRepository) {}

  getMeta() {
    return {
      categories: FAQ_CATEGORIES.map((value) => ({
        value,
        labelAr: FAQ_CATEGORY_LABEL_AR[value],
      })),
    };
  }

  private invalidate() {
    this.cache = null;
  }

  /** Active FAQs, cached for a minute (admin writes invalidate it). */
  async activeFaqs(): Promise<Faq[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_TTL_MS)
      return this.cache.faqs;
    const faqs = await this.repo.listActiveFaqsForRetrieval();
    this.cache = { at: now, faqs };
    return faqs;
  }

  async listPublic(query: Record<string, unknown>) {
    const parsed = faqQuerySchema.safeParse(query);
    if (!parsed.success) throwApi(400, 'invalid_query', 'معاملات غير صالحة');
    const { search, category, top } = parsed.data;
    const categories = this.getMeta().categories;
    const all = await this.activeFaqs();
    const scoped = category ? all.filter((f) => f.category === category) : all;

    if (search?.trim()) {
      const ranked = rankFaqs(search, scoped, {
        limit: 30,
        minScore: FAQ_SEARCH_MIN_SCORE,
      });
      return { faqs: ranked.map((r) => toPublic(r.faq)), categories };
    }

    if (top) {
      const byKey = new Map(
        scoped.filter((f) => f.key).map((f) => [f.key!, f]),
      );
      const curated = FAQ_TOP_KEYS.map((k) => byKey.get(k)).filter(
        (f): f is Faq => Boolean(f),
      );
      const picked = curated.length ? curated : scoped;
      return { faqs: picked.slice(0, top).map(toPublic), categories };
    }

    return { faqs: scoped.map(toPublic), categories };
  }

  /** Top knowledge-base matches for «مساعد سرح» (best first). */
  async retrieveForAssistant(
    text: string,
    limit = 3,
  ): Promise<RankedFaq<Faq>[]> {
    if (!text?.trim()) return [];
    try {
      const faqs = await this.activeFaqs();
      return rankFaqs(text, faqs, { limit, minScore: FAQ_SEARCH_MIN_SCORE });
    } catch {
      return [];
    }
  }

  async listAdmin(query: Record<string, unknown>) {
    const parsed = faqQuerySchema.safeParse(query);
    if (!parsed.success) throwApi(400, 'invalid_query', 'معاملات غير صالحة');
    const faqs = await this.repo.listAdminFaqs(parsed.data);
    return { faqs };
  }

  async create(body: Record<string, unknown>) {
    const parsed = createFaqSchema.safeParse(body);
    if (!parsed.success) throwApi(400, 'invalid_body', 'بيانات غير صالحة');
    const faq = await this.repo.createFaq(parsed.data);
    this.invalidate();
    return { faq };
  }

  async update(id: string, body: Record<string, unknown>) {
    const parsed = updateFaqSchema.safeParse(body);
    if (!parsed.success) throwApi(400, 'invalid_body', 'بيانات غير صالحة');
    const faq = await this.repo.updateFaq(id, parsed.data);
    this.invalidate();
    return { faq };
  }

  async remove(id: string) {
    await this.repo.softDeleteFaq(id);
    this.invalidate();
    return { ok: true };
  }

  async reorder(body: Record<string, unknown>) {
    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) throwApi(400, 'invalid_body', 'بيانات غير صالحة');
    await this.repo.reorderFaqs(parsed.data.items);
    this.invalidate();
    return { ok: true };
  }

  /** Service-status line for the help-center hub (AppSetting, admin-controlled). */
  async getServiceStatus(): Promise<ServiceStatus> {
    try {
      const row = await this.repo.getAppSetting(SERVICE_STATUS_SETTING_KEY);
      return parseServiceStatus(row?.value, row?.updatedAt ?? null);
    } catch {
      return parseServiceStatus(undefined, null);
    }
  }

  async setServiceStatus(
    body: Record<string, unknown>,
  ): Promise<ServiceStatus> {
    const parsed = serviceStatusSchema.safeParse(body);
    if (!parsed.success) throwApi(400, 'invalid_body', 'بيانات غير صالحة');
    const textAr =
      parsed.data.textAr?.trim() ||
      (parsed.data.state === 'ok' ? SERVICE_STATUS_DEFAULT_TEXT_AR : '');
    if (!textAr) {
      throwApi(400, 'invalid_body', 'اكتب نص الحالة عند وجود عطل');
    }
    const row = await this.repo.upsertAppSetting(
      SERVICE_STATUS_SETTING_KEY,
      { state: parsed.data.state, textAr },
      'حالة الخدمة في مركز المساعدة',
    );
    return parseServiceStatus(row.value, row.updatedAt);
  }
}

export function parseServiceStatus(
  value: unknown,
  updatedAt: Date | null,
): ServiceStatus {
  const v =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const state: ServiceStatusState = v.state === 'degraded' ? 'degraded' : 'ok';
  const text = typeof v.textAr === 'string' ? v.textAr.trim() : '';
  return {
    state,
    textAr: text || SERVICE_STATUS_DEFAULT_TEXT_AR,
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
  };
}
