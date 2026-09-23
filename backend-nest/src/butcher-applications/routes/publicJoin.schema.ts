import { z } from 'zod';
import { countrySchema } from '@/lib/countries';
import { HH_MM_REGEX } from '../constants';
import { addSnapshotCrossFieldIssues } from '../helpers/snapshotValidation';

function emptyToUndefined(value: unknown): unknown {
  if (value === '' || value === null) return undefined;
  return value;
}

function asTrue(value: unknown): unknown {
  return value === true || value === 'true';
}

function parseSpecialties(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) return parsed;
      } catch {
        /* comma-separated fallback */
      }
    }
    return trimmed
      .split(/[,،]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}

export const publicJoinBodySchema = z
  .object({
    phone: z.string().min(8).max(20),
    phone_token: z.string().min(10),
    displayName: z.string().min(2).max(50).trim(),
    arabicName: z.preprocess(
      emptyToUndefined,
      z.string().min(2).max(50).trim().optional(),
    ),
    email: z.preprocess(
      emptyToUndefined,
      z.string().email().max(254).toLowerCase().optional(),
    ),
    username: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .min(3)
        .max(30)
        .regex(/^[a-z0-9_]+$/, 'أحرف إنجليزية صغيرة وأرقام وشرطة سفلية فقط')
        .optional(),
    ),
    password: z.preprocess(
      emptyToUndefined,
      z.string().min(6).max(128).optional(),
    ),
    acceptedTerms: z.preprocess(asTrue, z.literal(true)),
    confirmAccuracy: z.preprocess(asTrue, z.literal(true)),
    nameAr: z.string().min(2).max(100).trim(),
    nameEn: z.string().min(2).max(100).trim(),
    shopPhone: z.string().regex(/^\+?[0-9]{8,15}$/, 'رقم هاتف غير صالح'),
    commercialReg: z
      .string()
      .min(5)
      .max(50)
      .regex(/^[A-Za-z0-9\-/]+$/, 'رقم السجل التجاري غير صالح'),
    country: countrySchema,
    city: z.string().min(2).max(100).trim(),
    cityAr: z.string().min(2).max(100).trim(),
    address: z.string().min(5).max(300).trim(),
    addressAr: z.string().min(5).max(300).trim(),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    bioAr: z.preprocess(
      emptyToUndefined,
      z.string().max(1000).trim().optional(),
    ),
    bioEn: z.preprocess(
      emptyToUndefined,
      z.string().max(1000).trim().optional(),
    ),
    specialties: z.preprocess(
      parseSpecialties,
      z.array(z.string().min(1).max(50).trim()).max(20).optional(),
    ),
    openTime: z.string().regex(HH_MM_REGEX, 'صيغة وقت الفتح يجب أن تكون HH:mm'),
    closeTime: z
      .string()
      .regex(HH_MM_REGEX, 'صيغة وقت الإغلاق يجب أن تكون HH:mm'),
    accountUsername: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[a-z0-9_]+$/, 'أحرف إنجليزية صغيرة وأرقام وشرطة سفلية فقط'),
    accountEmail: z.preprocess(
      emptyToUndefined,
      z.string().email().max(254).toLowerCase().optional(),
    ),
    accountPassword: z.string().min(6).max(128),
    accountPasswordConfirm: z.string().min(6).max(128),
  })
  .strict()
  .superRefine((data, ctx) => {
    addSnapshotCrossFieldIssues(data, ctx);
    if (data.accountPassword !== data.accountPasswordConfirm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'تأكيد كلمة المرور غير مطابق',
        path: ['accountPasswordConfirm'],
      });
    }
  });

export type PublicJoinBody = z.infer<typeof publicJoinBodySchema>;
