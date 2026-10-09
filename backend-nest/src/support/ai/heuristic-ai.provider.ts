import { SUPPORT_ASSISTANT_NAME_AR } from '../constants/support.constants';
import { contentTokens, FAQ_ANSWER_MIN_SCORE } from '../kb/faq-retrieval';
import {
  lastCustomerText,
  type AiProvider,
  type SarhanDecision,
  type SupportAiContext,
} from './ai-provider';
import {
  FRAUD_INFO_FALLBACK_AR,
  FRAUD_RE,
  HUMAN_REQUEST_RE,
  issueTypeForFaqKey,
  JAILBREAK_RE,
  PAYMENT_DISPUTE_RE,
  REFUND_INFO_FALLBACK_AR,
  REFUND_RE,
  THANKS_RE,
} from './support-guards';

const FOLLOW_UP_AR = 'إذا ما انحلت مشكلتك اكتب «موظف» وأحوّلك لخدمة العملاء.';

function previousAssistantReplies(context: SupportAiContext): string[] {
  return context.recentMessages
    .filter((m) => m.authorKind === 'SARHAN')
    .map((m) => m.body);
}

/**
 * Deterministic «مساعد سرح» (tests, and whenever no AI key is configured).
 * Answers from the FAQ knowledge base; hands off to a human when unsure.
 * Never performs or promises financial actions.
 */
export class HeuristicAiProvider implements AiProvider {
  async completeSupportTurn(
    context: SupportAiContext,
  ): Promise<SarhanDecision> {
    const text = lastCustomerText(context);
    const top = context.knowledge?.[0];
    const summary = text.slice(0, 240);

    if (JAILBREAK_RE.test(text)) {
      return {
        replyAr: `أنا ${SUPPORT_ASSISTANT_NAME_AR}، ما أقدر أنفّذ أوامر إدارية أو أكشف بيانات أحد. اكتب لي سؤالك عن سرح وأساعدك.`,
        issueType: 'OTHER',
        escalate: false,
      };
    }

    if (HUMAN_REQUEST_RE.test(text)) {
      return {
        replyAr: '',
        issueType: (context.issueType as SarhanDecision['issueType']) || 'OTHER',
        escalate: true,
        summary,
      };
    }

    if (FRAUD_RE.test(text)) {
      const info =
        context.knowledge.find((k) => k.key === 'safe-scammed')?.answerAr ??
        FRAUD_INFO_FALLBACK_AR;
      return {
        replyAr: info,
        issueType: 'FRAUD_REPORT',
        escalate: true,
        summary,
      };
    }

    if (REFUND_RE.test(text) || PAYMENT_DISPUTE_RE.test(text)) {
      const refund = REFUND_RE.test(text);
      const info =
        (top && top.key?.startsWith('pay-') && top.score >= FAQ_ANSWER_MIN_SCORE
          ? top.answerAr
          : null) ?? REFUND_INFO_FALLBACK_AR;
      return {
        replyAr: info,
        issueType: refund ? 'REFUND_ISSUE' : 'PAYMENT_ISSUE',
        escalate: true,
        summary,
      };
    }

    if (THANKS_RE.test(text)) {
      return {
        replyAr: 'العفو! إذا احتجت شي ثاني اكتب لي هنا.',
        issueType: (context.issueType as SarhanDecision['issueType']) || 'OTHER',
        escalate: false,
      };
    }

    const customerTurns = context.recentMessages.filter(
      (m) => m.authorKind === 'CUSTOMER',
    ).length;

    if (top && top.score >= FAQ_ANSWER_MIN_SCORE) {
      const alreadyAnswered = previousAssistantReplies(context).some((r) =>
        r.includes(top.answerAr),
      );
      if (alreadyAnswered || customerTurns >= 4) {
        return {
          replyAr: '',
          issueType: issueTypeForFaqKey(top.key),
          escalate: true,
          summary,
        };
      }
      return {
        replyAr: `${top.answerAr}\n\n${FOLLOW_UP_AR}`,
        issueType: issueTypeForFaqKey(top.key),
        escalate: false,
        summary: top.questionAr,
        metadataPatch: top.key ? { faqKey: top.key } : undefined,
      };
    }

    const askedToClarify = Boolean(
      (context.missingInformation || []).includes('problem_description'),
    );
    if (contentTokens(text).length < 2 && !askedToClarify && customerTurns < 4) {
      return {
        replyAr: 'وضّح لي سؤالك أكثر؟ مثلاً: «ما وصلني الكود» أو «كيف أميّز إعلاني».',
        issueType: 'OTHER',
        escalate: false,
        missingInformation: ['problem_description'],
      };
    }

    return {
      replyAr: '',
      issueType: (context.issueType as SarhanDecision['issueType']) || 'OTHER',
      escalate: true,
      summary,
    };
  }
}
