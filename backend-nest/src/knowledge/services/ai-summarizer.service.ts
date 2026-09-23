import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { LoggerService } from '../../common/services/logger.service';

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

@Injectable()
export class AISummarizerService {
  private readonly client: OpenAI | null;

  constructor(private readonly logger: LoggerService) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
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
      'AI summarize: using local fallback (OPENAI_API_KEY missing or failed)',
    );

    return {
      titleAr: input.title.trim() || 'خبر من مركز المعرفة',
      summary,
    };
  }

  async summarize(input: SummarizeInput): Promise<SummarizeResult> {
    const client = this.client;
    if (!client) {
      return this.fallbackSummarize(input);
    }

    try {
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              title: input.title,
              content: input.content,
              sourceName: input.sourceName,
              sourceUrl: input.sourceUrl,
            }),
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw) as {
        titleAr?: string;
        summary?: string;
      };

      const titleAr = (parsed.titleAr || input.title).trim();
      let summary = (parsed.summary || '').trim();
      if (!summary) {
        throw new Error('Empty summary from OpenAI');
      }
      if (!summary.includes(input.sourceUrl)) {
        summary = `${summary}\n\n🔗 المصدر:\n${input.sourceUrl}`;
      }

      return { titleAr, summary };
    } catch (err) {
      this.logger.error(
        { err, sourceUrl: input.sourceUrl },
        'AI summarize failed — using fallback',
      );
      return this.fallbackSummarize(input);
    }
  }
}
