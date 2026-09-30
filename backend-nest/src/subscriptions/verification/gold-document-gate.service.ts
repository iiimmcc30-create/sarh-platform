import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { throwApi } from '../../common/exceptions/api.exception';
import { tierForPlanSlug } from './verification-tiers';

/** Document type that proves a Gold (merchant) account. */
export const GOLD_REQUIRED_DOCUMENT_TYPE = 'COMMERCIAL_REGISTER';

type GateDocument = {
  id: string;
  type: string;
  fileKey: string;
  fileUrl: string;
};

export type GoldGateRequest = {
  id: string;
  status: string;
  requestedTier: string | null;
  approvedTier: string | null;
  documents: GateDocument[];
} | null;

export type GoldDocumentCode =
  | 'gold_document_required'
  | 'gold_document_not_submitted'
  | 'gold_verification_rejected';

export type GoldDocumentCheck =
  | {
      ok: true;
      requestId: string;
      documentId: string;
      verificationStatus: string;
    }
  | { ok: false; code: GoldDocumentCode; messageAr: string };

/** Link stored on a Gold payment (Payment.metadata.goldVerification). */
export type GoldPurchaseLink = {
  requestId: string;
  documentId: string;
  verificationStatus: string;
};

const MESSAGES_AR: Record<GoldDocumentCode, string> = {
  gold_document_required: 'الشارة الذهبية تتطلب إرفاق السجل التجاري قبل الدفع',
  gold_document_not_submitted:
    'أرسل طلب توثيق التاجر مع السجل التجاري قبل الدفع',
  gold_verification_rejected:
    'طلب توثيق التاجر مرفوض. حدّث المستند وأعد الإرسال قبل الدفع',
};

/**
 * A valid document is a commercial-register file uploaded through the existing
 * authenticated support upload (key under `support/<userId>/`) and attached to
 * the user's AccountVerificationRequest.
 */
export function isValidGoldDocument(
  doc: GateDocument,
  userId: string,
): boolean {
  if (doc.type !== GOLD_REQUIRED_DOCUMENT_TYPE) return false;
  if (!doc.fileUrl?.trim()) return false;
  const key = (doc.fileKey ?? '').replace(/^\/+/, '');
  return key.startsWith(`support/${userId}/`);
}

/**
 * Pure Gold purchase rule. The request must be for Gold (requested or already
 * approved), carry a valid commercial-register document, and be submitted for
 * review (UNDER_REVIEW) or approved (VERIFIED). Documents can no longer be
 * removed once submitted, so the linked document stays with the purchase.
 */
export function evaluateGoldDocument(
  request: GoldGateRequest,
  userId: string,
): GoldDocumentCheck {
  const fail = (code: GoldDocumentCode): GoldDocumentCheck => ({
    ok: false,
    code,
    messageAr: MESSAGES_AR[code],
  });
  if (!request) return fail('gold_document_required');
  const forGold =
    request.requestedTier === 'gold' || request.approvedTier === 'gold';
  const doc = request.documents.find((d) => isValidGoldDocument(d, userId));
  if (!forGold || !doc) return fail('gold_document_required');

  const approvedGold =
    request.status === 'VERIFIED' && request.approvedTier === 'gold';
  const underReview =
    request.status === 'UNDER_REVIEW' && request.requestedTier === 'gold';
  if (!approvedGold && !underReview) {
    return fail(
      request.status === 'REJECTED'
        ? 'gold_verification_rejected'
        : 'gold_document_not_submitted',
    );
  }
  return {
    ok: true,
    requestId: request.id,
    documentId: doc.id,
    verificationStatus: request.status,
  };
}

/**
 * Server-side Gold document gate used by Payment Core when a subscription
 * payment is created (POST /payments/initiate). Blue and Blue+ pass through.
 */
@Injectable()
export class GoldDocumentGateService {
  constructor(private readonly prisma: PrismaService) {}

  async check(userId: string): Promise<GoldDocumentCheck> {
    const request = await this.prisma.accountVerificationRequest.findUnique({
      where: { userId },
      select: {
        id: true,
        status: true,
        requestedTier: true,
        approvedTier: true,
        documents: {
          select: { id: true, type: true, fileKey: true, fileUrl: true },
        },
      },
    });
    return evaluateGoldDocument(request, userId);
  }

  /**
   * Returns null for non-Gold plans. For Gold, throws 403 unless a valid
   * document is attached, and returns the link stored on the payment.
   */
  async assertCanPurchase(
    userId: string,
    planSlug: string,
  ): Promise<GoldPurchaseLink | null> {
    if (tierForPlanSlug(planSlug) !== 'gold') return null;
    const result = await this.check(userId);
    if (!result.ok) throwApi(403, result.code, result.messageAr);
    return {
      requestId: result.requestId,
      documentId: result.documentId,
      verificationStatus: result.verificationStatus,
    };
  }
}
