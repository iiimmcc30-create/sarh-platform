import { readFileSync } from 'fs';
import path from 'path';
import { iosEaseBezier, spring } from '@/design-system/tokens/motion';
import {
  SHEET_DRAG_ZONE,
  shouldDismissSheet,
  shouldStartSheetDrag,
} from '@/lib/sheetMotion';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('iOS-style bottom sheet motion', () => {
  it('springs with a near-critically damped iOS spring', () => {
    expect(spring.ios).toEqual({ stiffness: 320, damping: 34, mass: 1, overshootClamping: true });
    const ratio = spring.ios.damping / (2 * Math.sqrt(spring.ios.stiffness * spring.ios.mass));
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThanOrEqual(1);
    expect(iosEaseBezier).toEqual([0.32, 0.72, 0, 1]);
  });

  it('grabs only a downward, mostly vertical drag that starts at the top of the sheet', () => {
    const base = { dx: 0, dy: 20, startY: 510, sheetTop: 500, dismissible: true };
    expect(shouldStartSheetDrag(base)).toBe(true);
    expect(shouldStartSheetDrag({ ...base, dismissible: false })).toBe(false);
    expect(shouldStartSheetDrag({ ...base, dy: -20 })).toBe(false);
    expect(shouldStartSheetDrag({ ...base, dx: 30 })).toBe(false);
    expect(shouldStartSheetDrag({ ...base, startY: 500 + SHEET_DRAG_ZONE + 20 })).toBe(false);
  });

  it('dismisses on a long drag or a quick flick, otherwise settles back', () => {
    expect(shouldDismissSheet(120, 0.1, 400)).toBe(true);
    expect(shouldDismissSheet(30, 1.4, 400)).toBe(true);
    expect(shouldDismissSheet(30, 0.2, 400)).toBe(false);
    // Short sheets need less travel.
    expect(shouldDismissSheet(60, 0, 150)).toBe(true);
  });

  it('SheetModal animates on the native driver only (RN Animated, no new libs)', () => {
    const sheet = src('components/ui/SheetModal.tsx');
    expect(sheet).toContain('animationType="none"');
    expect(sheet).toContain('PanResponder.create');
    expect(sheet).not.toMatch(/useNativeDriver:\s*false/);
    expect(sheet).not.toMatch(/react-native-reanimated|expo-haptics|react-native-gesture-handler/);
  });

  it('bottom sheets use the shared SheetModal instead of a fading / sliding Modal', () => {
    for (const file of [
      'components/ui/ActionSheetHost.tsx',
      'components/councils/CouncilSheet.tsx',
      'components/listing/ListingContactSheet.tsx',
      'components/listing/PromotionStatsSheet.tsx',
      'components/feature/RatingModal.tsx',
      'components/market/MarketCategoryPicker.tsx',
      'components/market/RegionCityPicker.tsx',
      'components/live/LiveBroadcastPledgeModal.tsx',
      'components/support/SupportFlowSheet.tsx',
    ]) {
      const s = src(file);
      expect(s).toContain('<SheetModal');
      expect(s).not.toContain('<Modal');
    }
    for (const file of ['components/feature/NewMessageSheet.tsx', 'components/feature/chat/ChatActionsSheet.tsx']) {
      expect(src(file)).toContain('Animated.spring(progress, { toValue: 1, ...spring.ios, useNativeDriver: true })');
    }
  });
});
