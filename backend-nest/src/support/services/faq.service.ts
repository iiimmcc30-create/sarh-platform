import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { throwApi } from '../../common/exceptions/api.exception';
import { SupportRepository } from '../repositories/support.repository';
import { FAQ_CATEGORY_LABEL_AR } from '../constants/support.constants';

const faqQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
});

const createFaqSchema = z.object({
  questionAr: z.string().min(3).max(500),
  answerAr: z.string().min(3).max(5000),
  category: z.enum([
    'ACCOUNT',
    'ADS',
    'MARKET',
    'BUY_SELL',
    'PAYMENT',
    'VERIFICATION',
    'BUTCHERS',
    'TECHNICAL',
    'GENERAL',
  ]),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
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

@Injectable()
export class FaqService {
  constructor(private readonly repo: SupportRepository) {}

  getMeta() {
    return {
      categories: Object.entries(FAQ_CATEGORY_LABEL_AR).map(
        ([value, labelAr]) => ({
          value,
          labelAr,
        }),
      ),
    };
  }

  async listPublic(query: Record<string, unknown>) {
    const parsed = faqQuerySchema.safeParse(query);
    if (!parsed.success) throwApi(400, 'invalid_query', 'معاملات غير صالحة');
    const faqs = await this.repo.listFaqs({ ...parsed.data, activeOnly: true });
    return { faqs, categories: this.getMeta().categories };
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
    return { faq };
  }

  async update(id: string, body: Record<string, unknown>) {
    const parsed = updateFaqSchema.safeParse(body);
    if (!parsed.success) throwApi(400, 'invalid_body', 'بيانات غير صالحة');
    const faq = await this.repo.updateFaq(id, parsed.data);
    return { faq };
  }

  async remove(id: string) {
    await this.repo.softDeleteFaq(id);
    return { ok: true };
  }

  async reorder(body: Record<string, unknown>) {
    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) throwApi(400, 'invalid_body', 'بيانات غير صالحة');
    await this.repo.reorderFaqs(parsed.data.items);
    return { ok: true };
  }
}
