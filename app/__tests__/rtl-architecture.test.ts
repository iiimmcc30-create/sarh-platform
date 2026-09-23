import { readFileSync } from 'fs';
import path from 'path';
import {
  getRtlRow,
  getRtlText,
  getRtlBlockTextStyle,
  getPhysicalLtrShellStyle,
  getCoverTrailRowStyle,
  rtlInputText,
  ltrInputText,
} from '@/lib/rtl';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('RTL policy — single I18nManager system', () => {
  it('keeps global forceRTL + swap and documents the policy', () => {
    const boot = src('index.js');
    expect(boot).toContain('I18nManager.forceRTL(true)');
    expect(boot).toContain('I18nManager.swapLeftAndRightInRTL(true)');
    expect(boot).toContain('RTL policy:');
    expect(src('lib/rtl.ts')).toContain('RTL policy (Sarh, Arabic default)');
  });

  it('getRtlRow is a logical row without reverse or LTR islands', () => {
    const row = getRtlRow();
    expect(row.flexDirection).toBe('row');
    expect(row.direction === 'rtl' || row.direction === 'ltr').toBe(true);
    expect(JSON.stringify(row)).not.toContain('row-reverse');
  });

  it('getRtlText / input styles do not set textAlign', () => {
    expect(getRtlText()).not.toHaveProperty('textAlign');
    expect(rtlInputText).not.toHaveProperty('textAlign');
    expect(ltrInputText).not.toHaveProperty('textAlign');
    expect(getRtlBlockTextStyle()).not.toHaveProperty('textAlign');
    expect(getPhysicalLtrShellStyle()).not.toHaveProperty('direction');
    expect(getCoverTrailRowStyle().flexDirection).toBe('row');
    expect(JSON.stringify(getCoverTrailRowStyle())).not.toContain('row-reverse');
  });
});

describe('shared primitives inherit the single RTL model', () => {
  it('RtlText and RtlTextShell implementations are gone', () => {
    expect(() => src('components/ui/RtlText.tsx')).toThrow();
    expect(() => src('components/ui/RtlTextShell.tsx')).toThrow();
    expect(src('components/ui/VerifiedInlineName.tsx')).not.toContain('row-reverse');
    expect(src('components/ui/SectionHeader.tsx')).not.toContain("direction: 'ltr'");
  });
});

describe('AppText / SarhInput primitives', () => {
  it('AppText has no textAlign or LTR shell', () => {
    const file = src('components/ui/AppText.tsx');
    expect(file).toContain('getRtlText()');
    expect(file).not.toContain("textAlign: 'right'");
    expect(file).not.toContain('RtlTextShell');
    expect(file).not.toContain("direction: 'ltr'");
  });

  it('SarhInput theme + foundation fields share the same RTL model', () => {
    const file = src('design-system/components/SarhInput.tsx');
    expect(file).toContain('getRtlRow()');
    expect(file).toContain('rtlInputText');
    expect(file).toContain('ltrInputText');
    expect(file).not.toContain('RtlTextShell');
    expect(file).not.toContain("direction: 'ltr'");
    expect(file).not.toContain('row-reverse');
    expect(file).not.toContain("textAlign: 'right'");
  });
});

describe('Add listing — workarounds removed', () => {
  const file = src('app/create/listing.tsx');

  it('uses AppText and has no dual-system patches', () => {
    expect(file).toContain("from '@/design-system/components'");
    expect(file).toContain('AppText');
    expect(file).toContain('موقع العرض');
    expect(file).toContain('عنوان العرض');
    expect(file).toContain('إعادة الاقتراح');
    expect(file).not.toContain("textAlign: 'right'");
    expect(file).not.toContain("direction: 'ltr'");
    expect(file).not.toContain('row-reverse');
    expect(file).not.toContain('RtlTextShell');
    expect(file).not.toContain("alignSelf: 'flex-end'");
  });
});

describe('RTL architecture fixture', () => {
  const file = src('components/ui/RtlPolicyFixture.tsx');

  it('is a new-screen template without workarounds', () => {
    expect(file).toContain('AppText');
    expect(file).toContain('SarhInput');
    expect(file).toContain('getRtlRow');
    expect(file).toContain('SarhButton');
    expect(file).not.toContain("textAlign: 'right'");
    expect(file).not.toContain("direction: 'ltr'");
    expect(file).not.toContain('row-reverse');
    expect(file).not.toContain('RtlTextShell');
  });
});
