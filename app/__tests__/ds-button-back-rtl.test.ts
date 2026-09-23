import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('SarhButton label layout', () => {
  it('keeps short labels on one line without shrinking the text', () => {
    const button = src('design-system/components/SarhButton.tsx');
    expect(button).toContain('numberOfLines={1}');
    expect(button).toContain("flexWrap: 'nowrap'");
    expect(button).toContain('flexShrink: 0');
    expect(button).not.toContain('fontSize:');
  });
});

describe('Back control uses a single RTL icon helper', () => {
  it('shared back button only reads rtlBackIcon', () => {
    const back = src('design-system/components/SarhBackButton.tsx');
    expect(back).toContain('rtlBackIcon()');
    expect(back).not.toContain('scaleX');
    expect(back).not.toContain('row-reverse');
  });

  it('uses the RTL arrow glyph, not a chevron, for back', () => {
    const rtl = src('lib/rtl.ts');
    expect(rtl).toContain("isAppRtl() ? 'arrow-forward' : 'arrow-back'");
    expect(rtl).not.toContain("isAppRtl() ? 'angle-right' : 'angle-left'");
  });

  it('ScreenHeader uses the shared back button', () => {
    const header = src('components/layout/ScreenHeader.tsx');
    expect(header).toContain('SarhBackButton');
    expect(header).toContain('getRtlRow()');
  });

  it('profile visitor back uses SarhBackButton instead of a raw icon', () => {
    const layout = src('components/feature/ProfileScreenLayout.tsx');
    expect(layout).toContain('SarhBackButton');
    expect(layout).not.toContain('rtlBackIcon');
  });
});
