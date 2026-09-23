import { z } from 'zod';
import type { Country } from '@prisma/client';
import { HH_MM_REGEX } from '../constants';
import { SUPPORTED_COUNTRIES } from '@/lib/countries';
import { ButcherApplicationError } from '../errors';
import type { ApplicationSnapshotInput } from '../types';

export { SUPPORTED_COUNTRIES };

export type SnapshotFormatField =
  | 'openTime'
  | 'closeTime'
  | 'nameAr'
  | 'nameEn'
  | 'shopPhone'
  | 'commercialReg'
  | 'country'
  | 'city'
  | 'cityAr'
  | 'address'
  | 'addressAr'
  | 'lat'
  | 'lng';

/** Reusable HH:mm check — Step 6 Zod schemas should call this for parity. */
export function assertValidHhMm(
  value: string,
  field: 'openTime' | 'closeTime',
): void {
  if (!HH_MM_REGEX.test(value)) {
    throw new ButcherApplicationError('APPLICATION_INCOMPLETE', {
      invalid: [field],
      reason: 'HH:mm format required',
    });
  }
}

/**
 * Low-level snapshot format validation for fields present in the input.
 * Does not enforce submit-required completeness — that stays in validateSubmitSnapshot.
 */
export function validateSnapshotFormat(input: ApplicationSnapshotInput): void {
  const invalid: SnapshotFormatField[] = [];

  if (input.openTime !== undefined) {
    try {
      assertValidHhMm(input.openTime, 'openTime');
    } catch {
      invalid.push('openTime');
    }
  }

  if (input.closeTime !== undefined) {
    try {
      assertValidHhMm(input.closeTime, 'closeTime');
    } catch {
      invalid.push('closeTime');
    }
  }

  if (
    input.openTime !== undefined &&
    input.closeTime !== undefined &&
    input.openTime === input.closeTime
  ) {
    invalid.push('closeTime');
  }

  if (input.lat !== undefined && (input.lat < -90 || input.lat > 90))
    invalid.push('lat');
  if (input.lng !== undefined && (input.lng < -180 || input.lng > 180))
    invalid.push('lng');
  if (input.lat === 0 && input.lng === 0) invalid.push('lat');

  if (invalid.length > 0) {
    throw new ButcherApplicationError('APPLICATION_INCOMPLETE', { invalid });
  }
}

/** Validate HH:mm on persisted snapshot values (used at submit). */
export function validatePersistedSnapshotTimes(
  openTime: string,
  closeTime: string,
): void {
  assertValidHhMm(openTime, 'openTime');
  assertValidHhMm(closeTime, 'closeTime');

  if (openTime === closeTime) {
    throw new ButcherApplicationError('APPLICATION_INCOMPLETE', {
      invalid: ['closeTime'],
    });
  }
}

export function isSupportedCountry(value: string): value is Country {
  return (SUPPORTED_COUNTRIES as readonly string[]).includes(value);
}

/** Cross-field snapshot checks shared by Zod schemas and validateSnapshotFormat. */
export function addSnapshotCrossFieldIssues(
  data: ApplicationSnapshotInput,
  ctx: z.RefinementCtx,
): void {
  if (
    data.openTime !== undefined &&
    data.closeTime !== undefined &&
    data.openTime === data.closeTime
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'وقت الإغلاق يجب أن يختلف عن وقت الفتح',
      path: ['closeTime'],
    });
  }

  if (data.lat === 0 && data.lng === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'يجب تحديد موقع المحل على الخريطة',
      path: ['lat'],
    });
  }
}
