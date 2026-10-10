const INDIC = '٠١٢٣٤٥٦٧٨٩';

function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (digit) => String(INDIC.indexOf(digit)));
}

function tokens(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)?/g) ?? [];
}

function grounded(token: string, evidence: string): boolean {
  const compact = token.replace(/[.,]/g, '');
  const dotted = token.replace(/,/g, '.');
  return (
    evidence.includes(token) ||
    evidence.includes(compact) ||
    evidence.includes(dotted)
  );
}

/**
 * Every number and calendar date in the reply must appear in tool results.
 * A reply with no numbers is allowed. Invented prices or dates are not.
 */
export function replyGroundedInTools(
  reply: string,
  toolResults: unknown[],
): boolean {
  const text = normalizeDigits(reply);
  const evidence = normalizeDigits(JSON.stringify(toolResults ?? []));
  const dates = text.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/g) ?? [];
  for (const date of dates) {
    if (!evidence.includes(date)) return false;
  }
  for (const token of tokens(text)) {
    if (!grounded(token, evidence)) return false;
  }
  return true;
}
