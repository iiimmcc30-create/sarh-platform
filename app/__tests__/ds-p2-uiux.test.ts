import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('P2 UI/UX consistency — frozen visuals', () => {
  it('does not restyle ListingCard, PostItem, or FloatingTabBar', () => {
    const card = src('components/feature/ListingCard.tsx');
    const post = src('components/feature/PostItem.tsx');
    const tabs = src('components/navigation/FloatingTabBar.tsx');
    expect(card).toContain('export const ListingCard');
    expect(post).toContain("from '@/components/ui/AppText'");
    expect(post).not.toContain("from '@/design-system/components'");
    expect(tabs).toContain("label: 'مجتمع سرح'");
    expect(tabs).not.toContain('SarhButton');
    expect(tabs).not.toContain('SarhBackButton');
  });

  it('unifies ScreenHeader on official text + back + a11y', () => {
    const header = src('components/layout/ScreenHeader.tsx');
    expect(header).toContain('SarhBackButton');
    expect(header).toContain('AppText');
    expect(header).toContain('numberOfLines={1}');
    expect(header).toContain('rightAccessibilityLabel');
    expect(header).toContain('accessibilityLabel="فتح القائمة"');
  });

  it('fees uses ScreenHeader and no physical chevron-forward back', () => {
    const fees = src('app/fees.tsx');
    expect(fees).toContain('ScreenHeader');
    expect(fees).not.toContain('chevron-forward');
    expect(fees).toContain('لا توجد رسوم مستحقة');
  });

  it('drops physical textAlign right on touched Arabic fields', () => {
    expect(src('app/search.tsx')).not.toContain('textAlign="right"');
    expect(src('app/info/contact.tsx')).not.toContain('textAlign="right"');
    expect(src('app/payment.tsx')).not.toContain('textAlign="right"');
    expect(src('components/market/MarketCategoryPicker.tsx')).not.toContain('paddingRight:');
    expect(src('app/payment.tsx')).toContain('SarhInput');
    expect(src('design-system/components/SarhInput.tsx')).toContain('rtlInputText');
  });
});
