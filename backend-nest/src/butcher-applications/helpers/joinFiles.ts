import type { ButcherApplicationDocumentType } from '@prisma/client';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_FILE_BYTES,
  MAX_SHOP_PHOTO_FILE_BYTES,
  REQUIRED_DOCUMENT_TYPES,
} from '../constants';
import { ButcherApplicationError } from '../errors';
import { throwApi } from '../../common/exceptions/api.exception';
import { mimeMatchesMagic } from '../../upload/file-magic';

export const JOIN_DOCUMENT_FIELD_NAMES = [
  'commercial_license',
  'national_id',
  'municipal_permit',
  'shop_photo',
  'other',
] as const satisfies readonly ButcherApplicationDocumentType[];

export type JoinDocumentFieldName = (typeof JOIN_DOCUMENT_FIELD_NAMES)[number];

export type JoinUploadedFiles = Partial<
  Record<JoinDocumentFieldName, Express.Multer.File[]>
>;

export type JoinFilePart = {
  type: JoinDocumentFieldName;
  file: Express.Multer.File;
};

export function flattenJoinFiles(
  files?: JoinUploadedFiles | null,
): JoinFilePart[] {
  const parts: JoinFilePart[] = [];
  for (const type of JOIN_DOCUMENT_FIELD_NAMES) {
    const file = files?.[type]?.[0];
    if (file) parts.push({ type, file });
  }
  return parts;
}

export function assertRequiredJoinFiles(parts: JoinFilePart[]): void {
  const present = new Set(parts.map((part) => part.type));
  const missing = REQUIRED_DOCUMENT_TYPES.filter((type) => !present.has(type));
  if (missing.length > 0) {
    throw new ButcherApplicationError('DOCUMENT_REQUIRED', { missing });
  }
}

export function maxBytesForJoinDocument(
  type: ButcherApplicationDocumentType,
): number {
  return type === 'shop_photo'
    ? MAX_SHOP_PHOTO_FILE_BYTES
    : MAX_DOCUMENT_FILE_BYTES;
}

export function assertJoinFileAcceptable(part: JoinFilePart): void {
  const { file, type } = part;
  const mime = file.mimetype;
  if (
    !ALLOWED_DOCUMENT_MIME_TYPES.includes(
      mime as (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number],
    )
  ) {
    throw new ButcherApplicationError('UNSUPPORTED_MIME_TYPE');
  }

  const size = file.size ?? file.buffer?.length ?? 0;
  if (!Number.isFinite(size) || size <= 0) {
    throw new ButcherApplicationError('INVALID_FILE');
  }
  if (size > maxBytesForJoinDocument(type)) {
    throw new ButcherApplicationError('FILE_TOO_LARGE', {
      maxBytes: maxBytesForJoinDocument(type),
    });
  }

  const header = file.buffer?.subarray(0, 32);
  if (header && header.length > 0 && !mimeMatchesMagic(mime, header)) {
    throwApi(400, 'validation_error', 'محتوى الملف لا يطابق نوعه المعلن');
  }

  const name = file.originalname ?? '';
  if (name.length > 255) {
    throw new ButcherApplicationError('INVALID_FILE');
  }
}
