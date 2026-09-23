export type ButcherApplicationErrorCode =
  | 'APPLICATION_NOT_FOUND'
  | 'DOCUMENT_NOT_FOUND'
  | 'BUTCHER_ALREADY_EXISTS'
  | 'ACTIVE_DRAFT_EXISTS'
  | 'ACTIVE_SUBMITTED_EXISTS'
  | 'APPLICATION_ALREADY_SUBMITTED'
  | 'APPLICATION_ALREADY_APPROVED'
  | 'APPLICATION_ALREADY_REJECTED'
  | 'APPLICATION_ALREADY_WITHDRAWN'
  | 'APPLICATION_NOT_EDITABLE'
  | 'INVALID_STATUS_TRANSITION'
  | 'APPLICATION_INCOMPLETE'
  | 'DOCUMENT_REQUIRED'
  | 'DOCUMENT_TYPE_ALREADY_EXISTS'
  | 'INVALID_FILE'
  | 'UNSUPPORTED_MIME_TYPE'
  | 'FILE_TOO_LARGE'
  | 'REJECTION_REASON_REQUIRED'
  | 'APPLICATION_CONFLICT'
  | 'APPLICATION_ACCESS_DENIED'
  | 'ACCOUNT_CREDENTIALS_REQUIRED'
  | 'ACCOUNT_CREDENTIALS_INVALID'
  | 'ACCOUNT_PASSWORD_MISMATCH'
  | 'ACCOUNT_CREDENTIALS_TAKEN';

const ERROR_META: Record<
  ButcherApplicationErrorCode,
  { httpStatus: number; messageEn: string; messageAr: string }
> = {
  APPLICATION_NOT_FOUND: {
    httpStatus: 404,
    messageEn: 'Application not found',
    messageAr: 'طلب التقديم غير موجود',
  },
  DOCUMENT_NOT_FOUND: {
    httpStatus: 404,
    messageEn: 'Document not found',
    messageAr: 'المستند غير موجود',
  },
  BUTCHER_ALREADY_EXISTS: {
    httpStatus: 409,
    messageEn: 'You already have a butcher profile',
    messageAr: 'لديك ملحمة مسجلة بالفعل',
  },
  ACTIVE_DRAFT_EXISTS: {
    httpStatus: 409,
    messageEn: 'You already have a draft application',
    messageAr: 'لديك طلب مسودة بالفعل',
  },
  ACTIVE_SUBMITTED_EXISTS: {
    httpStatus: 409,
    messageEn: 'You already have a submitted application under review',
    messageAr: 'لديك طلب قيد المراجعة بالفعل',
  },
  APPLICATION_ALREADY_SUBMITTED: {
    httpStatus: 409,
    messageEn: 'Application is already submitted',
    messageAr: 'تم إرسال الطلب مسبقاً',
  },
  APPLICATION_ALREADY_APPROVED: {
    httpStatus: 409,
    messageEn: 'Application is already approved',
    messageAr: 'تم قبول الطلب مسبقاً',
  },
  APPLICATION_ALREADY_REJECTED: {
    httpStatus: 409,
    messageEn: 'Application is already rejected',
    messageAr: 'تم رفض الطلب مسبقاً',
  },
  APPLICATION_ALREADY_WITHDRAWN: {
    httpStatus: 409,
    messageEn: 'Application is already withdrawn',
    messageAr: 'تم سحب الطلب مسبقاً',
  },
  APPLICATION_NOT_EDITABLE: {
    httpStatus: 409,
    messageEn: 'Application cannot be edited in its current status',
    messageAr: 'لا يمكن تعديل الطلب في حالته الحالية',
  },
  INVALID_STATUS_TRANSITION: {
    httpStatus: 409,
    messageEn: 'Invalid status transition',
    messageAr: 'انتقال حالة غير صالح',
  },
  APPLICATION_INCOMPLETE: {
    httpStatus: 422,
    messageEn: 'Application is missing required information',
    messageAr: 'الطلب ناقص بيانات مطلوبة',
  },
  DOCUMENT_REQUIRED: {
    httpStatus: 422,
    messageEn: 'Required document missing',
    messageAr: 'مستند مطلوب غير مرفوع',
  },
  DOCUMENT_TYPE_ALREADY_EXISTS: {
    httpStatus: 409,
    messageEn: 'Document type already uploaded',
    messageAr: 'هذا النوع من المستندات مرفوع مسبقاً',
  },
  INVALID_FILE: {
    httpStatus: 422,
    messageEn: 'Invalid or inaccessible file',
    messageAr: 'ملف غير صالح أو غير متاح',
  },
  UNSUPPORTED_MIME_TYPE: {
    httpStatus: 422,
    messageEn: 'Unsupported file type',
    messageAr: 'نوع الملف غير مدعوم',
  },
  FILE_TOO_LARGE: {
    httpStatus: 422,
    messageEn: 'File exceeds size limit',
    messageAr: 'حجم الملف يتجاوز الحد المسموح',
  },
  REJECTION_REASON_REQUIRED: {
    httpStatus: 422,
    messageEn: 'Rejection reason is required',
    messageAr: 'سبب الرفض مطلوب',
  },
  APPLICATION_CONFLICT: {
    httpStatus: 409,
    messageEn: 'Application was modified by another request',
    messageAr: 'تم تعديل الطلب من جهة أخرى',
  },
  APPLICATION_ACCESS_DENIED: {
    httpStatus: 403,
    messageEn: 'You do not have access to this application',
    messageAr: 'لا تملك صلاحية الوصول لهذا الطلب',
  },
  ACCOUNT_CREDENTIALS_REQUIRED: {
    httpStatus: 422,
    messageEn: 'Butcher account username and password are required',
    messageAr: 'اسم المستخدم وكلمة مرور حساب الملحمة مطلوبان',
  },
  ACCOUNT_CREDENTIALS_INVALID: {
    httpStatus: 422,
    messageEn: 'Butcher account credentials are invalid',
    messageAr: 'بيانات حساب الملحمة غير صالحة',
  },
  ACCOUNT_PASSWORD_MISMATCH: {
    httpStatus: 422,
    messageEn: 'Password confirmation does not match',
    messageAr: 'تأكيد كلمة المرور غير مطابق',
  },
  ACCOUNT_CREDENTIALS_TAKEN: {
    httpStatus: 409,
    messageEn: 'Butcher account username or email is already in use',
    messageAr:
      'اسم المستخدم أو البريد لحساب الملحمة مستخدم مسبقاً. لم يتم إنشاء الحساب',
  },
};

export class ButcherApplicationError extends Error {
  readonly code: ButcherApplicationErrorCode;
  readonly httpStatus: number;
  readonly messageAr: string;
  readonly details?: unknown;

  constructor(code: ButcherApplicationErrorCode, details?: unknown) {
    const meta = ERROR_META[code];
    super(meta.messageEn);
    this.name = 'ButcherApplicationError';
    this.code = code;
    this.httpStatus = meta.httpStatus;
    this.messageAr = meta.messageAr;
    this.details = details;
  }
}

export function isButcherApplicationError(
  err: unknown,
): err is ButcherApplicationError {
  return err instanceof ButcherApplicationError;
}

export function mapPrismaUniqueViolation(
  err: unknown,
): ButcherApplicationError | null {
  if (
    typeof err !== 'object' ||
    err === null ||
    !('code' in err) ||
    (err as { code: string }).code !== 'P2002'
  ) {
    return null;
  }

  const meta = (err as { meta?: Record<string, unknown> }).meta ?? {};
  const modelName = typeof meta.modelName === 'string' ? meta.modelName : '';
  const target = normalizeTarget(meta.target);
  const haystack = buildViolationHaystack(err, meta, target);

  if (modelName === 'User') {
    if (
      target.includes('username') ||
      target.includes('email') ||
      target.includes('phone')
    ) {
      return new ButcherApplicationError('ACCOUNT_CREDENTIALS_TAKEN');
    }
  }

  if (modelName === 'Butcher') {
    if (target.includes('userId') || haystack.includes('Butcher_userId_key')) {
      return new ButcherApplicationError('BUTCHER_ALREADY_EXISTS');
    }
    if (target.includes('sourceApplicationId')) {
      return new ButcherApplicationError('BUTCHER_ALREADY_EXISTS');
    }
  }

  if (modelName === 'ButcherApplication') {
    if (
      haystack.includes('ButcherApplication_one_draft_per_user_key') ||
      haystack.includes('one_draft_per_user')
    ) {
      return new ButcherApplicationError('ACTIVE_DRAFT_EXISTS');
    }
    if (
      haystack.includes('ButcherApplication_one_submitted_per_user_key') ||
      haystack.includes('one_submitted_per_user')
    ) {
      return new ButcherApplicationError('ACTIVE_SUBMITTED_EXISTS');
    }
    if (target.length === 1 && target[0] === 'userId') {
      // Partial uniques on userId alone — disambiguate via index name in driver message.
      if (haystack.includes('draft') || haystack.includes('DRAFT')) {
        return new ButcherApplicationError('ACTIVE_DRAFT_EXISTS');
      }
      if (haystack.includes('submitted') || haystack.includes('SUBMITTED')) {
        return new ButcherApplicationError('ACTIVE_SUBMITTED_EXISTS');
      }
    }
  }

  if (
    modelName === 'ButcherApplicationDocument' &&
    target.includes('applicationId') &&
    target.includes('type')
  ) {
    return new ButcherApplicationError('DOCUMENT_TYPE_ALREADY_EXISTS');
  }

  return null;
}

function normalizeTarget(target: unknown): string[] {
  if (Array.isArray(target)) {
    return target.filter((v): v is string => typeof v === 'string');
  }
  if (typeof target === 'string') return [target];
  return [];
}

function buildViolationHaystack(
  err: unknown,
  meta: Record<string, unknown>,
  target: string[],
): string {
  const message = err instanceof Error ? err.message : String(err);
  return [
    message,
    JSON.stringify(meta),
    target.join(','),
    typeof meta.constraint === 'string' ? meta.constraint : '',
    typeof meta.cause === 'string' ? meta.cause : '',
  ]
    .join(' ')
    .toLowerCase();
}
