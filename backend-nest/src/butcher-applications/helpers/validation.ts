import type { ButcherApplicationDocumentType } from '@prisma/client';
import type { ApplicationEntity } from '../repositories/application.repository';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_FILE_BYTES,
  MAX_SHOP_PHOTO_FILE_BYTES,
  REQUIRED_DOCUMENT_TYPES,
  SUBMIT_REQUIRED_SNAPSHOT_FIELDS,
  UNIQUE_REQUIRED_DOCUMENT_TYPES,
  APPLICATION_STORAGE_FOLDER,
} from '../constants';
import { ButcherApplicationError } from '../errors';
import type { DocumentUploadInput } from '../types';
import { validatePersistedSnapshotTimes } from './snapshotValidation';

export function validateSubmitSnapshot(application: ApplicationEntity): void {
  const missing: string[] = [];

  for (const field of SUBMIT_REQUIRED_SNAPSHOT_FIELDS) {
    const value = application[field];
    if (value === null || value === undefined || value === '') {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    throw new ButcherApplicationError('APPLICATION_INCOMPLETE', { missing });
  }

  validatePersistedSnapshotTimes(application.openTime, application.closeTime);
}

export function validateRequiredDocuments(
  application: ApplicationEntity,
): void {
  const missing: ButcherApplicationDocumentType[] = [];

  for (const type of REQUIRED_DOCUMENT_TYPES) {
    const doc = application.documents.find(
      (d) => d.type === type && d.fileKey && d.status === 'UPLOADED',
    );
    if (!doc) missing.push(type);
  }

  if (missing.length > 0) {
    throw new ButcherApplicationError('DOCUMENT_REQUIRED', { missing });
  }
}

export function validateDocumentUploadInput(input: DocumentUploadInput): void {
  if (
    !ALLOWED_DOCUMENT_MIME_TYPES.includes(
      input.mimeType as (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number],
    )
  ) {
    throw new ButcherApplicationError('UNSUPPORTED_MIME_TYPE');
  }

  const maxBytes =
    input.type === 'shop_photo'
      ? MAX_SHOP_PHOTO_FILE_BYTES
      : MAX_DOCUMENT_FILE_BYTES;

  if (input.fileSizeBytes > maxBytes) {
    throw new ButcherApplicationError('FILE_TOO_LARGE', { maxBytes });
  }

  if (!input.fileKey || input.fileKey.length < 10) {
    throw new ButcherApplicationError('INVALID_FILE');
  }
}

export function assertFileKeyOwnedByUser(
  fileKey: string,
  userId: string,
): void {
  const normalized = fileKey.replace(/^\/+/, '');
  const expectedPrefix = `${APPLICATION_STORAGE_FOLDER}/${userId}/`;

  if (
    !normalized.startsWith(expectedPrefix) &&
    !normalized.startsWith(`${APPLICATION_STORAGE_FOLDER}/`)
  ) {
    if (
      process.env.NODE_ENV !== 'production' &&
      (normalized.startsWith(`${APPLICATION_STORAGE_FOLDER}/`) ||
        normalized.includes(`${APPLICATION_STORAGE_FOLDER}/`))
    ) {
      return;
    }
    throw new ButcherApplicationError('INVALID_FILE');
  }

  if (!normalized.startsWith(expectedPrefix)) {
    throw new ButcherApplicationError('INVALID_FILE');
  }
}

export function isUniqueRequiredDocumentType(
  type: ButcherApplicationDocumentType,
): boolean {
  return UNIQUE_REQUIRED_DOCUMENT_TYPES.has(type);
}

export function collectChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(after)) {
    if (after[key] !== undefined && before[key] !== after[key]) {
      changed.push(key);
    }
  }
  return changed;
}

export function buildPaginatedResult<T extends { id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
  return { items, nextCursor, hasMore };
}
