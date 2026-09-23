import { z } from 'zod';

export const createStreamBodySchema = z
  .object({
    title: z.string().min(3).max(100),
    arabicTitle: z.string().min(3).max(100),
    category: z.enum([
      'camels',
      'horses',
      'sheep',
      'goats',
      'cattle',
      'falcons',
      'feed',
      'general',
    ]),
    topic: z.string().max(200).optional(),
    thumbnail: z.string().url().optional(),
  })
  .strict();

export type CreateStreamBodyDto = z.infer<typeof createStreamBodySchema>;
