import type { ButcherApplicationDocumentType } from '@prisma/client';

export const USER_PAGE_SIZE_DEFAULT = 20;
export const USER_PAGE_SIZE_MAX = 50;
export const ADMIN_PAGE_SIZE_DEFAULT = 20;
export const ADMIN_PAGE_SIZE_MAX = 100;

export const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const REQUIRED_DOCUMENT_TYPES: ButcherApplicationDocumentType[] = [
  'commercial_license',
  'national_id',
  'municipal_permit',
  'shop_photo',
];

export const UNIQUE_REQUIRED_DOCUMENT_TYPES = new Set(REQUIRED_DOCUMENT_TYPES);

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_DOCUMENT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SHOP_PHOTO_FILE_BYTES = 15 * 1024 * 1024;

export const SUBMIT_REQUIRED_SNAPSHOT_FIELDS = [
  'nameAr',
  'nameEn',
  'shopPhone',
  'commercialReg',
  'country',
  'city',
  'cityAr',
  'address',
  'addressAr',
  'lat',
  'lng',
  'openTime',
  'closeTime',
] as const;

export const APPLICATION_STORAGE_FOLDER = 'butcher-applications';

export const ADMIN_SORT_OPTIONS = [
  'submittedAt_desc',
  'createdAt_desc',
  'updatedAt_desc',
] as const;

export type AdminSortOption = (typeof ADMIN_SORT_OPTIONS)[number];
