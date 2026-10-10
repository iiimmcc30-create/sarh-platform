import { PiiPseudonymizer } from '../../ai-safety/pii-redaction';

const OPEN = '<<<UNTRUSTED_DATA>>>';
const CLOSE = '<<<END_UNTRUSTED_DATA>>>';

/** Redact PII, then mark the text as data so it is not instructions. */
export function wrapUntrusted(
  text: string,
  pii: PiiPseudonymizer = new PiiPseudonymizer(),
): string {
  return `${OPEN}\n${pii.redact(text)}\n${CLOSE}`;
}
