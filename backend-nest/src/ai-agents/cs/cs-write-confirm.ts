export type WriteKind = 'ticket' | 'note' | 'handoff';

function normalize(text: string): string {
  return text
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[،,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The customer themselves must say yes. The model cannot confirm on their behalf. */
export function hasExplicitWriteConfirmation(
  kind: WriteKind,
  customerText: string,
): boolean {
  const text = normalize(customerText);
  if (kind === 'ticket') return /نعم افتح تذكره/.test(text);
  if (kind === 'note') return /نعم (اضف|ارسل)/.test(text);
  return /نعم حول/.test(text);
}
