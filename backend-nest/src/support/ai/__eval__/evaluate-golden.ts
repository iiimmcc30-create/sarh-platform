import { readFileSync } from 'fs';
import { join } from 'path';
import { FAQ_KNOWLEDGE_BASE } from '../../kb/faq-knowledge-base';
import {
  FAQ_ANSWER_MIN_SCORE,
  FAQ_SEARCH_MIN_SCORE,
  rankFaqs,
} from '../../kb/faq-retrieval';
import { HeuristicAiProvider } from '../heuristic-ai.provider';
import type { SupportAiContext } from '../ai-provider';

export type GoldenExpect =
  | { outcome: 'faq'; faqKey: string }
  | { outcome: 'escalate'; reason: string };

export type GoldenCase = {
  id: string;
  question: string;
  expect: GoldenExpect;
};

export type GoldenFile = {
  version: number;
  locale: string;
  cases: GoldenCase[];
};

export type GoldenRow = {
  id: string;
  ok: boolean;
  expected: string;
  actual: string;
  score: number | null;
};

const FAQ_ROWS = FAQ_KNOWLEDGE_BASE.map((faq) => ({
  id: faq.key,
  key: faq.key,
  questionAr: faq.questionAr,
  answerAr: faq.answerAr,
  keywords: [...faq.keywords],
}));

export function loadGolden(
  file = join(__dirname, 'golden-ar.json'),
): GoldenFile {
  return JSON.parse(readFileSync(file, 'utf8')) as GoldenFile;
}

export function contextForQuestion(question: string): SupportAiContext {
  const ranked = rankFaqs(question, FAQ_ROWS, {
    limit: 3,
    minScore: FAQ_SEARCH_MIN_SCORE,
  });
  return {
    ticketNumber: 'SRH-EVAL',
    category: 'OTHER_HELP',
    customerFirstName: 'متعب',
    customerDescription: question,
    issueType: null,
    summary: null,
    missingInformation: [],
    recentMessages: [{ authorKind: 'CUSTOMER', body: question }],
    knowledge: ranked.map(({ faq, score }) => ({
      key: faq.key,
      questionAr: faq.questionAr,
      answerAr: faq.answerAr,
      actionRoute: null,
      actionLabel: null,
      score,
    })),
  };
}

export function actualLabel(decision: {
  escalate: boolean;
  escalationReason?: string;
  metadataPatch?: { faqKey?: string };
}): string {
  if (decision.escalate) return `escalate:${decision.escalationReason ?? ''}`;
  const key = decision.metadataPatch?.faqKey;
  return key ? `faq:${key}` : 'other';
}

export function expectedLabel(item: GoldenExpect): string {
  if (item.outcome === 'faq') return `faq:${item.faqKey}`;
  return `escalate:${item.reason}`;
}

/** Local assistant only. Does not call a model. */
export async function evaluateHeuristic(
  cases: GoldenCase[],
): Promise<GoldenRow[]> {
  const provider = new HeuristicAiProvider();
  const rows: GoldenRow[] = [];
  for (const item of cases) {
    const context = contextForQuestion(item.question);
    const decision = await provider.completeSupportTurn(context);
    const expected = expectedLabel(item.expect);
    const actual = actualLabel(decision);
    const top = context.knowledge[0];
    rows.push({
      id: item.id,
      ok: actual === expected,
      expected,
      actual,
      score: top && top.score >= FAQ_ANSWER_MIN_SCORE ? top.score : (top?.score ?? null),
    });
  }
  return rows;
}
