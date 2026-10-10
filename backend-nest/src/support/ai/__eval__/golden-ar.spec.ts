import { FAQ_KNOWLEDGE_BASE } from '../../kb/faq-knowledge-base';
import { evaluateHeuristic, loadGolden } from './evaluate-golden';

const REASONS = new Set([
  'human_requested',
  'fraud',
  'refund',
  'payment_dispute',
  'low_confidence',
  'repeated',
  'assistant_disabled',
  'assistant_decision',
]);

describe('golden Saudi support questions', () => {
  const golden = loadGolden();
  const keys = new Set(FAQ_KNOWLEDGE_BASE.map((faq) => faq.key));

  it('has 60 questions with a known faq key or an escalation reason', () => {
    expect(golden.cases).toHaveLength(60);
    expect(new Set(golden.cases.map((item) => item.id)).size).toBe(60);
    for (const item of golden.cases) {
      expect(item.question.trim().length).toBeGreaterThan(4);
      if (item.expect.outcome === 'faq') {
        expect(keys.has(item.expect.faqKey)).toBe(true);
      } else {
        expect(REASONS.has(item.expect.reason)).toBe(true);
      }
    }
  });

  it('the local assistant matches every expected outcome without a model', async () => {
    const rows = await evaluateHeuristic(golden.cases);
    const missed = rows.filter((row) => !row.ok);
    expect(missed).toEqual([]);
  });
});
