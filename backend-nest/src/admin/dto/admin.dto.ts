import { z } from 'zod';

export const adminLoginSchema = z
  .object({
    login: z.string().trim().min(1).optional(),
    /** Browser autofill / alternate clients may send username or email instead of login. */
    username: z.string().trim().min(1).optional(),
    email: z.string().trim().min(1).optional(),
    password: z.string().min(1),
    /** 6-digit TOTP code; required only for admins who enabled 2FA. */
    otp: z.string().trim().max(16).optional(),
  })
  .transform((data) => ({
    login: (data.login || data.username || data.email || '').trim(),
    password: data.password,
    otp: data.otp ? data.otp : undefined,
  }))
  .superRefine((data, ctx) => {
    if (!data.login) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'مطلوب',
        path: ['login'],
      });
    }
  });

/** Coerce query-string numbers; treat '', null, and invalid values as "missing" so defaults apply. */
function queryInt(defaultValue: number, min: number, max?: number) {
  const base = z.number().int().min(min);
  const bounded = max === undefined ? base : base.max(max);
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return undefined;
    // Invalid/out-of-range values fall back to the default instead of 400.
    if (n < min || (max !== undefined && n > max)) return undefined;
    return n;
  }, bounded.default(defaultValue));
}

export const paginationQuerySchema = z.object({
  page: queryInt(1, 1),
  pageSize: queryInt(20, 1, 100),
  search: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().optional(),
  ),
  hidden: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  live: z.string().optional(),
});

export const updateUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    verified: z.boolean().optional(),
    role: z.enum(['USER', 'ADMIN', 'MODERATOR']).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'empty_update' });

export const updatePostSchema = z.object({
  isHidden: z.boolean(),
});

export const updateListingSchema = z.object({
  status: z.enum(['active', 'sold', 'expired', 'pending_fee', 'suspended']),
});

const managedPhone = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{8,15}$/, 'رقم جوال غير صالح');

export const managedListingFieldsSchema = z
  .object({
    displayUsername: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[A-Za-z0-9_]+$/, 'اسم العرض: أحرف إنجليزية أو أرقام أو _'),
    displaySellerName: z.string().trim().min(2).max(80),
    displayPhone: managedPhone,
    displayRegion: z.string().trim().min(2).max(80),
    category: z.enum([
      'camels',
      'sheep',
      'goats',
      'cows',
      'horses',
      'birds',
      'feed',
      'equipment',
      'livestock',
      'transport',
      'slaughter',
    ]),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(3).max(4000),
    price: z.number().positive().max(100_000_000),
    images: z.array(z.string().url()).min(1).max(8),
    videoUrl: z.string().url().nullable().optional(),
    thumbnailUrl: z.string().url().nullable().optional(),
  })
  .strict();

export const createManagedListingSchema = managedListingFieldsSchema;

export const updateManagedListingSchema = managedListingFieldsSchema
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'empty_update' });

export const updateReportSchema = z
  .object({
    status: z
      .enum([
        'OPEN',
        'IN_REVIEW',
        'IN_PROGRESS',
        'AWAITING_USER',
        'RESOLVED',
        'CLOSED',
      ])
      .optional(),
    adminNotes: z.string().optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'empty_update' });

export const updateSettingSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  labelAr: z.string().optional(),
  category: z.string().optional(),
});

export const createSectionSchema = z.object({
  slug: z.string().min(1),
  titleAr: z.string().min(1),
  bodyAr: z.string().min(1),
  titleEn: z.string().optional(),
  bodyEn: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateSectionSchema = createSectionSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'empty_update' });

export type AdminLoginDto = z.infer<typeof adminLoginSchema>;
export type PaginationQueryDto = z.infer<typeof paginationQuerySchema>;
