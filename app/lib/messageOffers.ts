/** Structured price-offer messages for livestock / commerce chats. */

export const OFFER_PREFIX = 'عرض سعر:';

export type ParsedOfferMessage = {
  amount: number;
  currencyLabel: string;
  rawText: string;
};

export function formatOfferMessage(amount: number): string {
  const clean = Math.round(amount);
  return `${OFFER_PREFIX} ${clean.toLocaleString('en-US')} ر.س`;
}

export function parseOfferMessage(
  text?: string | null,
): ParsedOfferMessage | null {
  if (!text) return null;
  const trimmed = text.trim();
  const match = trimmed.match(
    /^عرض سعر[:：]\s*([\d٬,،.]+)\s*(ر\.?\s*س|SAR)?/i,
  );
  if (!match) return null;
  const numeric = Number(
    match[1].replace(/[٬,،]/g, '').replace(/\./g, (m, offset, full) => {
      // keep last decimal point if present as fraction; strip thousand separators
      return full.indexOf('.') === offset && full.lastIndexOf('.') === offset
        ? '.'
        : '';
    }),
  );
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return {
    amount: numeric,
    currencyLabel: 'ر.س',
    rawText: trimmed,
  };
}

export function isOfferAcceptText(text?: string | null): boolean {
  return (text ?? '').trim() === 'أوافق على العرض';
}

export function isOfferRejectText(text?: string | null): boolean {
  return (text ?? '').trim() === 'أرفض العرض';
}
