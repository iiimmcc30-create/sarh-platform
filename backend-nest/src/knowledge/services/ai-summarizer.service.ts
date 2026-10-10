import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { LoggerService } from '../../common/services/logger.service';
import { AiCallGuardService } from '../../ai-safety/ai-call-guard.service';
import { isAiEnabled } from '../../ai-safety/ai-flags';
import { PiiPseudonymizer } from '../../ai-safety/pii-redaction';

const SUMMARY_MAX_OUTPUT_TOKENS = 1_000;

export type SummarizeInput = {
  title: string;
  content: string;
  sourceName: string;
  sourceUrl: string;
};

export type SummarizeResult = {
  titleAr: string;
  summary: string;
};

const SYSTEM_PROMPT = `أنت محرر أخبار متخصص في قطاع الثروة الحيوانية والزراعة في السعودية.

قم بتلخيص الخبر باللغة العربية الفصحى.

الشروط:

- لا تخترع معلومات.
- لا تغير الحقائق.
- لا تضف آراء.
- اجعل الملخص بين 100 و150 كلمة.
- استخدم أسلوبًا احترافيًا.
- لا تنسخ النص الأصلي.
- أضف في النهاية:

🔗 المصدر:
(الرابط)

أرجع الناتج بصيغة JSON فقط بالمفاتيح:
titleAr (عنوان عربي مختصر)
summary (الملخص الكامل بما فيه سطر المصدر في النهاية)`;

export const SUMMARY_RESPONSE_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'knowledge_summary',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        titleAr: { type: 'string' },
        summary: { type: 'string' },
      },
      required: ['titleAr', 'summary'],
    },
  },
};

@Injectable()
export class AISummarizerService {
  private readonly client: OpenAI | null;

  constructor(
    private readonly logger: LoggerService,
    private readonly guard: AiCallGuardService,
  ) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    this.client = apiKey ? new OpenAI({ apiKey, maxRetries: 0 }) : null;
  }

  /** Configured and allowed by the master switch SARH_AI_ENABLED. */
  isConfigured(): boolean {
    return this.client !== null && isAiEnabled();
  }

  /** Local fallback so Knowledge Center can still auto-publish without OpenAI. */
  private fallbackSummarize(input: SummarizeInput): SummarizeResult {
    const snippet = (input.content || input.title).trim().replace(/\s+/g, ' ');
    const summaryBody =
      snippet.length > 450
        ? `${snippet.slice(0, 447)}...`
        : snippet || input.title;
    const summary = [summaryBody, '', '🔗 المصدر:', input.sourceUrl].join('\n');

    this.logger.info(
      { sourceUrl: input.sourceUrl },
      'AI summarize: using local fallback (AI off, OPENAI_API_KEY missing, budget, timeout or error)',
    );

    return {
      titleAr: input.title.trim() || 'خبر من مركز المعرفة',
      summary,
    };
  }

  async summarize(input: SummarizeInput): Promise<SummarizeResult> {
    const client = this.client;
    if (!client || !isAiEnabled()) {
      return this.fallbackSummarize(input);
    }

    // Public news, but still minimise obvious identifiers (phones, e-mails,
    // IDs) before it leaves; the source URL is kept verbatim.
    const pii = new PiiPseudonymizer();
    const userContent = JSON.stringify({
      title: pii.redact(input.title),
      content: pii.redact(input.content),
      sourceName: pii.redact(input.sourceName),
      sourceUrl: input.sourceUrl,
    });
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const result = await this.guard.run({
      feature: 'knowledge_summarizer',
      model,
      inputChars: SYSTEM_PROMPT.length + userContent.length,
      maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
      call: async ({ signal, timeout, maxRetries }) => {
        const completion = await client.chat.completions.create(
          {
            model,
            temperature: 0.2,
            max_completion_tokens: SUMMARY_MAX_OUTPUT_TOKENS,
            store: false,
            response_format: SUMMARY_RESPONSE_FORMAT,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userContent },
            ],
          },
          { signal, timeout, maxRetries },
        );
        return {
          value: completion.choices[0]?.message?.content ?? '{}',
          usage: completion.usage ?? null,
        };
      },
    });
    if (!result.ok) return this.fallbackSummarize(input);

    try {
      const parsed = JSON.parse(result.value) as {
        titleAr?: string;
        summary?: string;
      };
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('invalid_summary_json');
      }
      if (
        typeof parsed.summary !== 'string' ||
        typeof parsed.titleAr !== 'string'
      ) {
        throw new Error('invalid_summary_json');
      }

      const titleAr = pii.restore(parsed.titleAr || input.title).trim();
      let summary = pii.restore(parsed.summary || '').trim();
      if (!summary) {
        throw new Error('Empty summary from OpenAI');
      }
      if (!summary.includes(input.sourceUrl)) {
        summary = `${summary}\n\n🔗 المصدر:\n${input.sourceUrl}`;
      }

      return { titleAr, summary };
    } catch (err) {
      this.logger.error(
        {
          errorName: err instanceof Error ? err.name : 'ai_error',
          sourceUrl: input.sourceUrl,
        },
        'AI summarize failed — using fallback',
      );
      return this.fallbackSummarize(input);
    }
  }
}
