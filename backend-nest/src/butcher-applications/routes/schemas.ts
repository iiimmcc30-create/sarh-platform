import { z } from 'zod';
import { countrySchema } from '@/lib/countries';
import {
  HH_MM_REGEX,
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_FILE_BYTES,
  MAX_SHOP_PHOTO_FILE_BYTES,
  ADMIN_SORT_OPTIONS,
} from '../constants';
import { addSnapshotCrossFieldIssues } from '../helpers/snapshotValidation';

export const uuidSchema = z.string().uuid('معرّف غير صالح');

export const documentTypeSchema = z.enum([
  'commercial_license',
  'national_id',
  'municipal_permit',
  'shop_photo',
  'other',
]);

const documentMimeSchema = z.enum(ALLOWED_DOCUMENT_MIME_TYPES);

export const documentUploadBodySchema = z
  .object({
    type: documentTypeSchema,
    fileKey: z.string().min(10).max(512),
    originalFileName: z.string().min(1).max(255).optional(),
    mimeType: documentMimeSchema,
    fileSizeBytes: z.number().int().positive().max(MAX_SHOP_PHOTO_FILE_BYTES),
  })
  .strict()
  .superRefine((data, ctx) => {
    const maxBytes =
      data.type === 'shop_photo'
        ? MAX_SHOP_PHOTO_FILE_BYTES
        : MAX_DOCUMENT_FILE_BYTES;
    if (data.fileSizeBytes > maxBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'حجم الملف يتجاوز الحد المسموح',
        path: ['fileSizeBytes'],
      });
    }
  });

export const documentReplaceBodySchema = z
  .object({
    fileKey: z.string().min(10).max(512),
    originalFileName: z.string().min(1).max(255).optional(),
    mimeType: documentMimeSchema,
    fileSizeBytes: z.number().int().positive().max(MAX_SHOP_PHOTO_FILE_BYTES),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.fileSizeBytes > MAX_DOCUMENT_FILE_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'حجم الملف يتجاوز الحد المسموح',
        path: ['fileSizeBytes'],
      });
    }
  });

export const applicationStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
]);

export const snapshotSchema = z
  .object({
    nameAr: z.string().min(2).max(100).trim().optional(),
    nameEn: z.string().min(2).max(100).trim().optional(),
    shopPhone: z
      .string()
      .regex(/^\+?[0-9]{8,15}$/, 'رقم هاتف غير صالح')
      .optional(),
    commercialReg: z
      .string()
      .min(5)
      .max(50)
      .regex(/^[A-Za-z0-9\-/]+$/, 'رقم السجل التجاري غير صالح')
      .optional(),
    country: countrySchema.optional(),
    city: z.string().min(2).max(100).trim().optional(),
    cityAr: z.string().min(2).max(100).trim().optional(),
    address: z.string().min(5).max(300).trim().optional(),
    addressAr: z.string().min(5).max(300).trim().optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    bioAr: z.string().max(1000).trim().optional(),
    bioEn: z.string().max(1000).trim().optional(),
    specialties: z.array(z.string().min(1).max(50).trim()).max(20).optional(),
    openTime: z
      .string()
      .regex(HH_MM_REGEX, 'صيغة وقت الفتح يجب أن تكون HH:mm')
      .optional(),
    closeTime: z
      .string()
      .regex(HH_MM_REGEX, 'صيغة وقت الإغلاق يجب أن تكون HH:mm')
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => addSnapshotCrossFieldIssues(data, ctx));

export const listQuerySchema = z
  .object({
    cursor: uuidSchema.optional(),
    status: applicationStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

export const submitBodySchema = z
  .object({
    acceptedTerms: z.literal(true),
    confirmAccuracy: z.literal(true),
    accountUsername: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[a-z0-9_]+$/, 'أحرف إنجليزية صغيرة وأرقام وشرطة سفلية فقط'),
    accountEmail: z.string().trim().email().max(254).toLowerCase().optional(),
    password: z.string().min(6).max(128),
    confirmPassword: z.string().min(6).max(128),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'تأكيد كلمة المرور غير مطابق',
        path: ['confirmPassword'],
      });
    }
  });

export const withdrawBodySchema = z
  .object({
    reason: z.string().max(500).trim().optional(),
  })
  .strict();

export const adminListQuerySchema = z
  .object({
    cursor: uuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: applicationStatusSchema.optional(),
    country: countrySchema.optional(),
    submittedFrom: z.coerce.date().optional(),
    submittedTo: z.coerce.date().optional(),
    search: z.string().min(2).max(100).optional(),
    sort: z.enum(ADMIN_SORT_OPTIONS).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.submittedFrom &&
      data.submittedTo &&
      data.submittedFrom > data.submittedTo
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية',
        path: ['submittedTo'],
      });
    }
  });

export const approveBodySchema = z
  .object({
    comment: z.string().min(1).max(2000).trim().optional(),
  })
  .strict();

export const rejectBodySchema = z
  .object({
    rejectionReason: z.string().min(10).max(1000).trim(),
    comment: z.string().min(1).max(2000).trim().optional(),
  })
  .strict();

export const commentBodySchema = z
  .object({
    comment: z.string().min(1).max(2000).trim(),
  })
  .strict();
