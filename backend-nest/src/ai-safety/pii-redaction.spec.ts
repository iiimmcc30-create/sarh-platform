import { normalizeDigits, PiiPseudonymizer, redactPii } from './pii-redaction';

/** Synthetic test values only — not real people. */
describe('PII redaction (Saudi formats)', () => {
  const phones = [
    '0501234567',
    '050 123 4567',
    '050-123-4567',
    '+966501234567',
    '+966 50 123 4567',
    '00966501234567',
    '00966 50 123 4567',
    '+966 (0) 50 123 4567',
    '966501234567',
    '501234567',
    '٠٥٠١٢٣٤٥٦٧',
    '+٩٦٦٥٠١٢٣٤٥٦٧',
    '٠٥٠ ١٢٣ ٤٥٦٧',
    '۰۵۰۱۲۳۴۵۶۷',
    '0112345678',
    '+966 11 234 5678',
  ];

  it.each(phones)('hides phone «%s»', (p) => {
    const out = redactPii(`رقمي ${p} تواصل معي`);
    expect(out).toMatch(/\[(PHONE|NUMBER)_1\]/);
    expect(out).not.toMatch(/\d{4}/);
    expect(out).toContain('رقمي');
    expect(out).toContain('تواصل معي');
  });

  it('gives every format of the same mobile one pseudonym', () => {
    const pii = new PiiPseudonymizer();
    const a = pii.redact('0501234567');
    const b = pii.redact('+966 50 123 4567');
    const c = pii.redact('٠٠٩٦٦٥٠١٢٣٤٥٦٧');
    expect(a).toBe('[PHONE_1]');
    expect(b).toBe('[PHONE_1]');
    expect(c).toBe('[PHONE_1]');
  });

  it('hides e-mails (also next to Arabic text)', () => {
    const out = redactPii('ايميلي test.user+1@example.com.sa وشكراً');
    expect(out).toBe('ايميلي [EMAIL_1] وشكراً');
  });

  it.each([
    ['1012345678', 'NATIONAL_ID'],
    ['١٠١٢٣٤٥٦٧٨', 'NATIONAL_ID'],
    ['1 012 345 678', 'NATIONAL_ID'],
    ['2412345678', 'IQAMA'],
    ['٢٤١٢٣٤٥٦٧٨', 'IQAMA'],
    ['2-412-345-678', 'IQAMA'],
  ])('hides Saudi ID «%s» as %s', (id, kind) => {
    const out = redactPii(`رقم الهوية ${id}`);
    expect(out).toBe(`رقم الهوية [${kind}_1]`);
  });

  it.each([
    'SA0380000000608010167519',
    'SA03 8000 0000 6080 1016 7519',
    'sa03-8000-0000-6080-1016-7519',
    'SA٠٣٨٠٠٠٠٠٠٠٦٠٨٠١٠١٦٧٥١٩',
  ])('hides IBAN «%s»', (iban) => {
    expect(redactPii(`حوّلت على ${iban} أمس`)).toBe('حوّلت على [IBAN_1] أمس');
  });

  it('hides Luhn-valid card numbers and other long digit runs', () => {
    expect(redactPii('بطاقة 4111 1111 1111 1111')).toBe('بطاقة [CARD_1]');
    expect(redactPii('رقم الحوالة 987654321098')).toBe(
      'رقم الحوالة [NUMBER_1]',
    );
  });

  it('keeps what the assistant needs: ticket numbers, prices, dates, URLs', () => {
    const text =
      'تذكرتي SRH-2026-000123 دفعت ٤٩ ريال يوم 2026-10-10 الساعة 10:30 والرابط https://sarhsa.online/listing/1234567890 والإعلان 3fa85f64-5717-4562-b3fc-2c963f66afa6';
    const out = redactPii(text);
    expect(out).toContain('SRH-2026-000123');
    expect(out).toContain('49 ريال');
    expect(out).toContain('2026-10-10');
    expect(out).toContain('10:30');
    expect(out).toContain('https://sarhsa.online/listing/1234567890');
    expect(out).toContain('3fa85f64-5717-4562-b3fc-2c963f66afa6');
    expect(out).not.toMatch(/\[[A-Z_]+_\d\]/);
  });

  it('handles several kinds in one message with stable numbering', () => {
    const pii = new PiiPseudonymizer();
    const out = pii.redact(
      'جوالي 0551112222 وجوال أخوي 0553334444 وايميلي a@b.co وجوالي مرة ثانية 055 111 2222',
    );
    expect(out).toBe(
      'جوالي [PHONE_1] وجوال أخوي [PHONE_2] وايميلي [EMAIL_1] وجوالي مرة ثانية [PHONE_1]',
    );
    expect(pii.replacedCount).toBe(3);
  });

  it('restores pseudonyms in the model answer locally', () => {
    const pii = new PiiPseudonymizer();
    pii.redact('رقمي 0501234567');
    expect(pii.restore('بنتواصل معك على [PHONE_1] قريباً [EMAIL_9]')).toBe(
      'بنتواصل معك على 0501234567 قريباً [EMAIL_9]',
    );
  });

  it('documents a known limit: dotted numbers are not detected', () => {
    // Limitation kept visible on purpose (see pii-redaction.ts header).
    expect(redactPii('050.123.4567')).toBe('050.123.4567');
  });

  it('normalizes Arabic-Indic and Persian digits', () => {
    expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹')).toBe(
      '0123456789 0123456789',
    );
  });

  it('returns empty string for empty input', () => {
    expect(redactPii('')).toBe('');
    expect(redactPii(null)).toBe('');
  });
});
