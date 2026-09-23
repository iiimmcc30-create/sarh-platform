import { z } from 'zod';
import { countrySchema } from '../../shared/lib/countries';

export const adminLoginSchema = z
  .object({
    login: z.string().trim().min(1).optional(),
    /** Browser autofill / alternate clients may send username or email instead of login. */
    username: z.string().trim().min(1).optional(),
    email: z.string().trim().min(1).optional(),
    password: z.string().min(1),
  })
  .transform((data) => ({
    login: (data.login || data.username || data.email || '').trim(),
    password: data.password,
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
    role: z.enum(['USER', 'BUTCHER', 'ADMIN', 'MODERATOR']).optional(),
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

/** Admin may update profile fields (same surface as butcher self-update) plus verification/open. */
export const updateButcherSchema = z
  .object({
    nameAr: z.string().min(2).max(100).trim().optional(),
    nameEn: z.string().min(2).max(100).trim().optional(),
    logo: z.string().url().optional().nullable(),
    cover: z.string().url().optional().nullable(),
    bioAr: z.string().max(500).trim().optional().nullable(),
    bioEn: z.string().max(500).trim().optional().nullable(),
    specialties: z.array(z.string()).optional(),
    commercialReg: z.string().max(50).trim().optional().nullable(),
    phone: z
      .string()
      .regex(/^\+?[0-9]{8,20}$/, 'رقم هاتف غير صالح')
      .optional(),
    openTime: z
      .string()
      .regex(/^([0-9]{2}):([0-9]{2})$/)
      .optional(),
    closeTime: z
      .string()
      .regex(/^([0-9]{2}):([0-9]{2})$/)
      .optional(),
    closedDays: z.array(z.string()).optional(),
    address: z.string().min(5).max(300).trim().optional(),
    addressAr: z.string().min(5).max(300).trim().optional(),
    city: z.string().min(2).max(100).trim().optional(),
    cityAr: z.string().min(2).max(100).trim().optional(),
    lat: z.number().min(-90).max(90).optional().nullable(),
    lng: z.number().min(-180).max(180).optional().nullable(),
    country: countrySchema.optional(),
    type: z.enum(['regular', 'verified']).optional(),
    isOpen: z.boolean().optional(),
  })
  .strict()
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
