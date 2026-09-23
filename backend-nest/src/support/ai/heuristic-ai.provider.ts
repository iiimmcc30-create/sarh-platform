import type {
  AiProvider,
  SarhanDecision,
  SupportAiContext,
} from './ai-provider';

const JAILBREAK =
  /تجاهل تعليمات|ignore (the )?instructions|system prompt|أعطني بيانات مستخدم|refund now|نفذ (refund|استرجاع)|api key|password/i;

const HUMAN_REQUEST =
  /موظف|خدمة العملاء|تحدث مع إنسان|human|agent|مش عايز بوت|مو بوت/i;

const PAYMENT =
  /استرجاع|تعويض|فلوس|المبلغ|refund|payment|الدفع|البطاقة|مدفوع مرتين/i;

const NOT_RECEIVED =
  /ما وصل|لم يصل|ما استلمت|ما وصلني|متأخر|delay|didn't arrive|not received/i;

const MISSING = /ناقص|نقص|ما فيه|missing|incomplete/i;

const WRONG = /غلط|خطأ|مو هذا|wrong item|incorrect/i;

const DAMAGED = /تالف|فاسد|مكسور|damaged|spoiled/i;

const DELIVERY = /توصيل|مندوب|عنوان|delivery|driver/i;

function lastCustomerText(context: SupportAiContext): string {
  const last = [...context.recentMessages]
    .reverse()
    .find((m) => m.authorKind === 'CUSTOMER');
  return (last?.body || context.customerDescription || '').trim();
}

/**
 * Deterministic Sarhan used in tests and when no AI credentials are configured.
 * Understand / ask / classify / escalate only — never mutates orders.
 */
export class HeuristicAiProvider implements AiProvider {
  async completeSupportTurn(
    context: SupportAiContext,
  ): Promise<SarhanDecision> {
    const text = lastCustomerText(context);

    if (JAILBREAK.test(text)) {
      return {
        replyAr:
          'ما أقدر أنفذ أوامر إدارية أو أكشف بيانات مستخدمين آخرين. أقدر أساعدك في وصف مشكلتك ضمن بلاغك فقط.',
        issueType:
          (context.issueType as SarhanDecision['issueType']) || 'OTHER',
        escalate: false,
      };
    }

    if (HUMAN_REQUEST.test(text) || PAYMENT.test(text)) {
      const issueType = PAYMENT.test(text)
        ? /استرجع|استرجاع|refund/i.test(text)
          ? 'REFUND_ISSUE'
          : 'PAYMENT_ISSUE'
        : (context.issueType as SarhanDecision['issueType']) || 'OTHER';
      return {
        replyAr:
          'سأرفع حالتك لخدمة العملاء لمراجعتها. ما أقدر أعدّل الطلب أو أنفّذ استرجاعًا بنفسي.',
        issueType,
        escalate: true,
        summary: text.slice(0, 240),
      };
    }

    if (NOT_RECEIVED.test(text)) {
      if (context.order) {
        return {
          replyAr:
            'سجّلت أن الطلب لم يصل، وسأحوّل الحالة للفريق المختص لمتابعتها.',
          issueType: 'ORDER_NOT_RECEIVED',
          escalate: true,
          missingInformation: [],
          summary: 'الطلب لم يصل',
          metadataPatch: { issueType: 'ORDER_NOT_RECEIVED' },
        };
      }
      return {
        replyAr:
          'أفهمك، خلني أتأكد من تفاصيل طلبك.\nهل المشكلة أن الطلب لم يصل حتى الآن؟',
        issueType: 'ORDER_NOT_RECEIVED',
        escalate: false,
        missingInformation: ['confirm_not_received'],
        summary: 'الطلب لم يصل',
        metadataPatch: { issueType: 'ORDER_NOT_RECEIVED' },
      };
    }

    if (MISSING.test(text)) {
      const missing = ['itemName', 'quantity'];
      const haveName = Boolean(
        (context.missingInformation || []).length === 0 &&
        /اسم|قطعة|كيلو/.test(text),
      );
      return {
        replyAr: haveName
          ? 'تمام، سجّلت النقص. هل بقيت معلومات تحتاج تضيفها؟'
          : 'ما اسم المنتج الناقص؟\nوكم الكمية التي لم تستلمها؟',
        issueType: 'ORDER_ITEM_MISSING',
        escalate: false,
        missingInformation: haveName ? [] : missing,
        summary: 'منتج ناقص',
        metadataPatch: { issueType: 'ORDER_ITEM_MISSING' },
      };
    }

    if (WRONG.test(text)) {
      return {
        replyAr: 'وضح لي ما المنتج الذي استلمته وما المنتج الصحيح المتوقع؟',
        issueType: 'WRONG_ITEM',
        escalate: false,
        missingInformation: ['expectedItem', 'receivedItem'],
        summary: 'منتج خاطئ',
      };
    }

    if (DAMAGED.test(text)) {
      return {
        replyAr: 'آسف على ذلك. هل يمكنك وصف التلف وهل يؤثر على كل الكمية؟',
        issueType: 'DAMAGED_ITEM',
        escalate: false,
        missingInformation: ['damageDescription'],
        summary: 'منتج تالف',
      };
    }

    if (DELIVERY.test(text)) {
      return {
        replyAr: 'هل المشكلة في وقت التوصيل، العنوان، أم المندوب؟',
        issueType: 'DELIVERY_ISSUE',
        escalate: false,
        missingInformation: ['deliveryDetail'],
        summary: 'مشكلة توصيل',
      };
    }

    if (context.issueType && context.missingInformation?.length) {
      return {
        replyAr: 'شكرًا للتوضيح. هل تحتاج تحويل البلاغ لموظف خدمة العملاء؟',
        issueType: context.issueType as SarhanDecision['issueType'],
        escalate: false,
        missingInformation: [],
        summary: context.summary || text.slice(0, 160),
      };
    }

    if (
      context.recentMessages.filter((m) => m.authorKind === 'CUSTOMER')
        .length >= 4
    ) {
      return {
        replyAr: 'سأرفع حالتك لخدمة العملاء لمراجعتها.',
        issueType:
          (context.issueType as SarhanDecision['issueType']) || 'OTHER',
        escalate: true,
        summary: context.summary || text.slice(0, 160),
      };
    }

    const knownCategory =
      context.category &&
      context.category !== 'OTHER' &&
      context.category !== 'OTHER_HELP';
    const knownDescription =
      (context.customerDescription || text).trim().length >= 10;
    if (knownCategory && knownDescription) {
      return {
        replyAr: 'اطلعت على التفاصيل المرسلة وسأحوّل الطلب للفريق المختص.',
        issueType: 'OTHER',
        escalate: true,
        summary: (context.customerDescription || text).slice(0, 160),
        missingInformation: [],
      };
    }

    return {
      replyAr:
        'خلني أفهم المشكلة أكثر: هل تتعلق بطلبك، بالدفع، أم باستفسار عام؟',
      issueType: 'OTHER',
      escalate: false,
      missingInformation: ['problem_category'],
    };
  }
}
