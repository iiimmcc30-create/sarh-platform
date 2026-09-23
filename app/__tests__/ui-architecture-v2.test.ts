import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fontFamily, fontWeight, SEMANTIC_TYPE_ROLE, TYPE_ROLE_ALIAS, resolveTypeRole, typography } from '@/design-system';
import { resolveAppTextStyle, resolveSurfaceLevelStyle } from '@/design-system/components/resolvers';
import { GAP as GAP_SCALE, SECTION_GAP } from '@/design-system/layout/metrics';
import { applyThemeScheme, colors as liveColors } from '@/constants/theme';
import {
  BREAKPOINT_METRICS,
  BREAKPOINT_MIN_WIDTH,
  CONTENT_MAX_WIDTH,
  resolveBreakpoint,
  resolveLayout,
} from '@/hooks/useLayout';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

/** Source with comments removed — negative rules must not trip on docs. */
function code(rel: string) {
  return src(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const LAYOUT_DIR = 'design-system/layout';

const L2 = [
  { file: 'Screen.tsx', symbol: 'Screen' },
  { file: 'ScreenBody.tsx', symbol: 'ScreenBody' },
  { file: 'Section.tsx', symbol: 'Section' },
  { file: 'Stack.tsx', symbol: 'Stack' },
  { file: 'Row.tsx', symbol: 'Row' },
  { file: 'BottomAction.tsx', symbol: 'BottomAction' },
];

describe('Architecture V2 — L2 layout layer', () => {
  it('ships every layout primitive and exports it from the layout barrel', () => {
    const barrel = src(`${LAYOUT_DIR}/index.ts`);
    for (const { file, symbol } of L2) {
      expect(existsSync(path.join(root, LAYOUT_DIR, file))).toBe(true);
      expect(src(`${LAYOUT_DIR}/${file}`)).toContain(`export function ${symbol}(`);
      expect(barrel).toMatch(new RegExp(`export \\{[^}]*\\b${symbol}\\b[^}]*\\}`));
    }
    expect(barrel).toContain("from './Screen'");
    expect(barrel).toContain("from './ScreenBody'");
    expect(barrel).toContain("from './BottomAction'");
    expect(existsSync(path.join(root, 'hooks/useLayout.ts'))).toBe(true);
  });

  it('keeps the token barrel free of React components', () => {
    const tokensBarrel = src('design-system/index.ts');
    expect(tokensBarrel).not.toContain('./layout');
    expect(tokensBarrel).not.toContain('./components');
  });

  it('reuses the existing spacing grid instead of a second scale', () => {
    const metrics = src(`${LAYOUT_DIR}/metrics.ts`);
    expect(metrics).toContain("from '@/design-system/tokens'");
    expect(metrics).toContain('spaceAlias');
    expect(code(`${LAYOUT_DIR}/metrics.ts`)).not.toMatch(/gap:\s*\d/);
    expect(SECTION_GAP).toBe(24);
  });

  it('holds no raw hex and no module-scope color in layout files', () => {
    for (const { file } of L2) {
      const text = code(`${LAYOUT_DIR}/${file}`);
      expect(text).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
      const moduleStyles = text.match(/const styles = StyleSheet\.create\(\{[\s\S]*?\n\}\);/);
      if (moduleStyles) {
        expect(moduleStyles[0]).not.toContain('colors.');
        expect(moduleStyles[0]).not.toContain('backgroundColor');
      }
    }
  });
});

describe('Architecture V2 — Screen and ScreenBody own the shell', () => {
  it('Screen owns safe area, page background, RTL root and keyboard', () => {
    const screen = src(`${LAYOUT_DIR}/Screen.tsx`);
    expect(screen).toContain('SafeAreaView');
    expect(screen).toContain('getRtlDirection()');
    expect(screen).toContain('KeyboardAvoidingView');
    expect(screen).toContain('SarhPatternBackground');
    expect(screen).toContain('colors.screenRoot');
  });

  it('uses padding keyboard avoidance because Android edge-to-edge does not resize', () => {
    expect(src('app.json')).toContain('"edgeToEdgeEnabled": true');
    const screen = src(`${LAYOUT_DIR}/Screen.tsx`);
    expect(screen).toContain('behavior="padding"');
    expect(screen).not.toMatch(/: undefined/);
  });

  it('ScreenBody owns gutter, max width, bottom inset and scroll', () => {
    const body = src(`${LAYOUT_DIR}/ScreenBody.tsx`);
    expect(body).toContain('useLayout()');
    expect(body).toContain('paddingHorizontal: gutter ? layout.gutter : 0');
    expect(body).toContain('maxWidthFor(width)');
    expect(body).toContain('useSafeAreaInsets()');
    expect(body).toContain('AppScrollView');
    expect(body).toContain('export function FullBleed');
  });

  it('BottomAction is safe-area aware and pairs with the action inset', () => {
    const action = src(`${LAYOUT_DIR}/BottomAction.tsx`);
    expect(action).toContain("edges={['bottom']}");
    expect(action).toContain('BOTTOM_ACTION_MIN_HEIGHT');
    expect(action).toContain('StyleSheet.hairlineWidth');
    expect(src(`${LAYOUT_DIR}/ScreenBody.tsx`)).toContain('BOTTOM_ACTION_MIN_HEIGHT');
  });
});

describe('Architecture V2 — Section is layout, never a card', () => {
  it('has no background, radius, border or shadow', () => {
    const section = code(`${LAYOUT_DIR}/Section.tsx`);
    expect(section).not.toContain('backgroundColor');
    expect(section).not.toContain('borderRadius');
    expect(section).not.toContain('borderWidth');
    expect(section).not.toContain('shadow');
    expect(section).not.toContain('elevation');
  });

  it('leaves the gap between sections to the parent, not the Section', () => {
    const section = code(`${LAYOUT_DIR}/Section.tsx`);
    expect(section).not.toMatch(/margin(Top|Bottom|Vertical)?:/);
    expect(section).not.toMatch(/padding(Top|Bottom|Vertical)?:/);
    expect(GAP_SCALE.section).toBe(24);
  });

  it('titles a section with the shared type role', () => {
    expect(src(`${LAYOUT_DIR}/Section.tsx`)).toContain('variant="sectionTitle"');
  });
});

describe('Architecture V2 — Row absorbs RTL', () => {
  it('uses the central helper and never reverses rows', () => {
    expect(src(`${LAYOUT_DIR}/Row.tsx`)).toContain("from '@/lib/rtl'");
    const row = code(`${LAYOUT_DIR}/Row.tsx`);
    expect(row).toContain('getRtlRow()');
    expect(row).not.toContain('row-reverse');
    expect(row).not.toContain('marginLeft');
    expect(row).not.toContain('marginRight');
    expect(row).not.toMatch(/textAlign:\s*'(left|right)'/);
  });

  for (const { file } of L2) {
    it(`${file} keeps physical edges out of layout`, () => {
      const text = code(`${LAYOUT_DIR}/${file}`);
      expect(text).not.toContain('row-reverse');
      expect(text).not.toMatch(/(padding|margin)(Left|Right):/);
    });
  }
});

describe('Architecture V2 — responsive contract', () => {
  it('resolves the three breakpoints from width alone', () => {
    expect(BREAKPOINT_MIN_WIDTH).toEqual({ compact: 0, medium: 600, expanded: 1024 });
    expect(resolveBreakpoint(390)).toBe('compact');
    expect(resolveBreakpoint(599)).toBe('compact');
    expect(resolveBreakpoint(600)).toBe('medium');
    expect(resolveBreakpoint(1023)).toBe('medium');
    expect(resolveBreakpoint(1024)).toBe('expanded');
  });

  it('pairs each breakpoint with one gutter and one content cap', () => {
    expect(BREAKPOINT_METRICS.compact).toMatchObject({ gutter: 16, maxWidth: null });
    expect(BREAKPOINT_METRICS.medium).toMatchObject({ gutter: 24, maxWidth: 720 });
    expect(BREAKPOINT_METRICS.expanded).toMatchObject({ gutter: 32, maxWidth: 960 });
    expect(CONTENT_MAX_WIDTH.form).toBe(560);
  });

  it('caps forms at 560 without exceeding the content cap', () => {
    expect(resolveLayout(390).maxWidthFor('form')).toBe(560);
    expect(resolveLayout(390).maxWidthFor('content')).toBeNull();
    expect(resolveLayout(390).maxWidthFor('full')).toBeNull();
    expect(resolveLayout(800).maxWidthFor('form')).toBe(560);
    expect(resolveLayout(800).maxWidthFor('content')).toBe(720);
    expect(resolveLayout(1400).maxWidthFor('content')).toBe(960);
    expect(resolveLayout(1400).maxWidthFor('full')).toBeNull();
  });

  it('survives a missing or zero width', () => {
    expect(resolveLayout(0).breakpoint).toBe('compact');
    expect(resolveLayout(Number.NaN).gutter).toBe(16);
  });

  it('keeps Dimensions and platform layout branches out of the hook', () => {
    const hook = code('hooks/useLayout.ts');
    expect(hook).toContain('useWindowDimensions');
    expect(hook).not.toContain('Dimensions.get');
    expect(hook).not.toContain('Platform.OS');
  });
});

describe('Architecture V2 — typography roles', () => {
  it('exposes every semantic role from the blueprint', () => {
    expect(SEMANTIC_TYPE_ROLE).toEqual({
      Display: 'display',
      ScreenTitle: 'heading1',
      SectionTitle: 'heading2',
      CardTitle: 'heading3',
      Body: 'body',
      BodyMedium: 'label',
      Label: 'bodySmall',
      Caption: 'caption',
      Meta: 'micro',
      Button: 'label',
      Price: 'price',
    });
    for (const name of Object.keys(SEMANTIC_TYPE_ROLE) as (keyof typeof SEMANTIC_TYPE_ROLE)[]) {
      expect(typography[SEMANTIC_TYPE_ROLE[name]]).toBeDefined();
    }
  });

  it('resolves camelCase aliases and physical roles to the same tokens', () => {
    expect(TYPE_ROLE_ALIAS.sectionTitle).toBe('heading2');
    expect(resolveTypeRole('sectionTitle')).toBe('heading2');
    expect(resolveTypeRole('SectionTitle')).toBe('heading2');
    expect(resolveTypeRole('heading2')).toBe('heading2');
    expect(resolveTypeRole('bodyMedium')).toBe('label');
    expect(resolveTypeRole('meta')).toBe('micro');
    expect(resolveTypeRole('button')).toBe('label');
    expect(resolveAppTextStyle({ variant: 'sectionTitle' })).toMatchObject(
      resolveAppTextStyle({ variant: 'heading2' }),
    );
  });

  it('adds Price as the only new role', () => {
    expect(typography.price).toEqual({
      fontFamily: fontFamily.bold,
      fontSize: 16,
      lineHeight: 24,
      fontWeight: fontWeight.bold,
    });
    expect(resolveAppTextStyle({ variant: 'price' })).toMatchObject({ fontSize: 16 });
  });

  it('keeps real weights instead of remapping everything to Bold', () => {
    const weights = new Set(Object.values(typography).map((token) => token.fontWeight));
    expect(weights).toEqual(new Set(['400', '500', '600', '700']));
    const families = new Set(Object.values(typography).map((token) => token.fontFamily));
    expect(families.size).toBeGreaterThan(1);
    expect(typography.body.fontWeight).toBe('400');
    expect(typography.label.fontWeight).toBe('500');
    expect(typography.heading2.fontWeight).toBe('600');
  });
});

describe('Architecture V2 — surface hierarchy', () => {
  it('treats section as the default no-chrome level', () => {
    const section = resolveSurfaceLevelStyle('section');
    expect(section.backgroundColor).toBe('transparent');
    expect(section.borderWidth).toBe(0);
    expect(section.borderRadius).toBeUndefined();
  });

  it('gives surface a color only and card the radius + hairline', () => {
    const surface = resolveSurfaceLevelStyle('surface');
    expect(surface.borderWidth).toBe(0);
    expect(surface.borderRadius).toBeUndefined();

    const card = resolveSurfaceLevelStyle('card');
    expect(card.borderRadius).toBe(16);
    expect(card.borderWidth).toBe(1);
    expect(card.elevation).toBe(0);

    const floating = resolveSurfaceLevelStyle('floating');
    expect(floating.borderRadius).toBe(16);
    expect(floating.elevation).toBeGreaterThan(0);
  });

  it('follows the live theme through a light/dark toggle', () => {
    applyThemeScheme('dark');
    const darkCard = resolveSurfaceLevelStyle('card').backgroundColor;
    const darkPage = resolveSurfaceLevelStyle('page').backgroundColor;

    applyThemeScheme('light');
    const lightCard = resolveSurfaceLevelStyle('card').backgroundColor;
    const lightPage = resolveSurfaceLevelStyle('page').backgroundColor;

    expect(darkCard).not.toBe(lightCard);
    expect(darkPage).not.toBe(lightPage);
    expect(lightCard).toBe(liveColors.bgSurface);
    expect(lightPage).toBe(liveColors.screenRoot);

    applyThemeScheme('dark');
    expect(resolveSurfaceLevelStyle('card').backgroundColor).toBe(darkCard);
  });

  it('lets SarhCard opt into a level without losing variant support', () => {
    const card = src('design-system/components/SarhCard.tsx');
    expect(card).toContain('level?: SarhSurfaceLevel');
    expect(card).toContain('resolveSurfaceLevelStyle');
    expect(card).toContain('resolveSarhCardStyle');
  });
});

describe('Architecture V2 — navigation chrome', () => {
  it('declares the four header variants and defaults to screen', () => {
    const header = src('components/layout/ScreenHeader.tsx');
    expect(header).toContain(
      "export type ScreenHeaderVariant = 'screen' | 'tab' | 'sheet' | 'modal'",
    );
    expect(header).toContain("variant = 'screen'");
    expect(header).toContain("variant === 'tab'");
    expect(header).toContain("variant === 'sheet'");
    expect(header).toContain("variant === 'modal'");
  });

  it('stays backward compatible with the shipped screen header', () => {
    const header = src('components/layout/ScreenHeader.tsx');
    expect(header).toContain('SarhBackButton');
    expect(header).toContain('numberOfLines={1}');
    expect(header).toContain('rightAccessibilityLabel');
    expect(header).toContain('accessibilityLabel="فتح القائمة"');
    expect(header).toContain("variant === 'screen'");
  });

  it('takes the responsive gutter from useLayout instead of a fixed spacing.lg', () => {
    const header = src('components/layout/ScreenHeader.tsx');
    expect(header).toContain('useLayout');
    expect(header).toContain('paddingHorizontal: gutter');
    expect(code('components/layout/ScreenHeader.tsx')).not.toMatch(/paddingHorizontal:\s*spacing\.lg/);
  });

  it('lets AppText own header type instead of spreading legacy theme typography', () => {
    expect(code('components/layout/ScreenHeader.tsx')).not.toMatch(/\.\.\.typography\./);
  });
});

const WAVE_1 = [
  'app/listing/[id]/promote.tsx',
  'app/settings/index.tsx',
  'components/ui/SettingsMenuScreen.tsx',
  'app/info/about.tsx',
  'app/info/contact.tsx',
  'app/info/privacy.tsx',
  'app/info/terms.tsx',
  'app/info/refund.tsx',
  'app/info/policy/[slug].tsx',
  'app/support/faq.tsx',
  'app/support/verification.tsx',
  'app/support/tickets/index.tsx',
  'app/support/tickets/create.tsx',
  'app/support/tickets/[id].tsx',
];

describe('Architecture V2 — Wave 1 migrated screens', () => {
  for (const file of WAVE_1) {
    it(`${file} composes with the L2 layer`, () => {
      const text = src(file);
      expect(text).toContain("from '@/design-system/layout'");
      expect(text).toContain('<Screen');
      expect(text).toContain('<ScreenBody');
      expect(text).toContain('<ScreenHeader variant="screen"');
    });

    it(`${file} hands layout, RTL and type to the system`, () => {
      const text = code(file);
      expect(text).not.toContain('SafeAreaView');
      expect(text).not.toContain('AppScrollView');
      expect(text).not.toContain('KeyboardAvoidingView');
      expect(text).not.toContain('getRtlRow');
      expect(text).not.toContain('getRtlText');
      expect(text).not.toContain('getRtlDirection');
      expect(text).not.toContain('Dimensions.get');
      expect(text).not.toContain('GlassCard');
      expect(text).not.toMatch(/fontSize:/);
      expect(text).not.toMatch(/fontWeight:/);
      expect(text).not.toMatch(/fontFamily:/);
      expect(text).not.toMatch(/textAlign:\s*'(left|right)'/);
      expect(text).not.toMatch(/(margin|padding)(Left|Right):/);
      expect(text).not.toContain('row-reverse');
    });

    it(`${file} keeps module-scope styles free of theme colors`, () => {
      const moduleStyles = code(file).match(/const styles = StyleSheet\.create\(\{[\s\S]*?\n\}\);/);
      if (moduleStyles) expect(moduleStyles[0]).not.toContain('colors.');
    });
  }

  it('keeps promote on the server-priced payment flow', () => {
    const promote = src('app/listing/[id]/promote.tsx');
    expect(promote).toContain('buildPromoteCheckoutPayload');
    expect(promote).toContain('initiatePromotePayment');
    expect(promote).toContain('fetchPromoteQuote');
    expect(promote).toContain('listPromoteCatalogOptions');
    expect(promote).toContain('launchPaymentCheckout');
    expect(promote).toContain('<BottomAction');
    expect(promote).not.toContain('ListingCard');
  });

  it('keeps settings and info hubs flat instead of card stacks', () => {
    for (const file of ['app/settings/index.tsx', 'components/ui/SettingsMenuScreen.tsx']) {
      const text = src(file);
      expect(text).toContain('SarhSettingsSection');
      expect(text).toContain('SarhSettingsRow');
      expect(text).toContain('gutter={false}');
      expect(text).not.toContain('SarhCard');
    }
    for (const file of ['app/info/privacy.tsx', 'app/info/terms.tsx', 'app/info/refund.tsx']) {
      expect(src(file)).not.toContain('SarhCard');
    }
  });

  it('uses semantic type roles rather than ad-hoc sizes', () => {
    const promote = src('app/listing/[id]/promote.tsx');
    expect(promote).toContain('variant="price"');
    expect(promote).toContain('variant="bodyMedium"');
    expect(src('app/info/terms.tsx')).toContain('variant="cardTitle"');
    expect(src('app/info/contact.tsx')).toContain('variant="bodyMedium"');
  });
});

describe('Architecture V2 — permanent guardrails', () => {
  const FROZEN = [
    'components/feature/ListingCard.tsx',
    'components/feature/PostItem.tsx',
    'components/navigation/FloatingTabBar.tsx',
  ];

  it('leaves the marketplace card, feed post and tab bars untouched', () => {
    for (const file of FROZEN) {
      const text = src(file);
      expect(text).not.toContain("from '@/design-system/layout'");
      expect(text).not.toContain('<ScreenBody');
      expect(text).not.toContain('<BottomAction');
    }
    const card = src('components/feature/ListingCard.tsx');
    expect(card).toContain('export const ListingCard');
    expect(card).not.toContain('SarhCard');
    expect(src('components/feature/PostItem.tsx')).toContain("from '@/components/ui/AppText'");
  });

  it('does not add a styling library or a third text primitive', () => {
    const pkg = JSON.parse(src('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const banned of ['nativewind', 'styled-components', 'tamagui', '@emotion/native']) {
      expect(deps[banned]).toBeUndefined();
    }
    for (const { file } of L2) {
      const text = src(`${LAYOUT_DIR}/${file}`);
      expect(text).not.toContain('function AppText');
    }
  });

  it('keeps the marketplace card language separate from flat screens', () => {
    const card = src('components/feature/ListingCard.tsx');
    expect(card).not.toContain("from '@/design-system/layout'");
    expect(card).not.toContain('SarhCard');
    for (const file of WAVE_1) {
      expect(src(file)).not.toContain('ListingCard');
    }
  });
});

/** Screens that own their own shell. */
const WAVE_2_SHELLS = [
  'components/feature/ProfileScreenLayout.tsx',
  'components/feature/ProfileSettingsMenuScreen.tsx',
  'components/feature/ProfileFieldEditScreen.tsx',
  'app/profile/edit/index.tsx',
  'app/profile/connections.tsx',
  'app/profile/settings/account.tsx',
  'app/profile/settings/password.tsx',
  'app/profile/settings/change-phone.tsx',
  'app/profile/settings/privacy.tsx',
  'app/settings/blocked.tsx',
];

/**
 * Profile routes that delegate their shell to `ProfileScreenLayout` and only
 * contribute tab content, so they compose with L2 without owning a `Screen`.
 */
const WAVE_2_CONTENT = ['app/(tabs)/profile.tsx', 'app/users/[id].tsx'];

const WAVE_2 = [...WAVE_2_SHELLS, ...WAVE_2_CONTENT];

describe('Architecture V2 — Wave 2 profile screens', () => {
  for (const file of WAVE_2_SHELLS) {
    it(`${file} composes its shell with the L2 layer`, () => {
      const text = src(file);
      expect(text).toContain("from '@/design-system/layout'");
      expect(text).toContain('<Screen');
      expect(text).toContain('<ScreenBody');
    });
  }

  for (const file of WAVE_2_CONTENT) {
    it(`${file} contributes content through L2 primitives`, () => {
      expect(src(file)).toContain("from '@/design-system/layout'");
    });
  }

  for (const file of WAVE_2) {
    it(`${file} hands layout, RTL and type to the system`, () => {
      const text = code(file);
      expect(text).not.toContain('SafeAreaView');
      expect(text).not.toContain('AppScrollView');
      expect(text).not.toContain('KeyboardAvoidingView');
      expect(text).not.toContain('getRtlRow');
      expect(text).not.toContain('getRtlText');
      expect(text).not.toContain('getRtlDirection');
      expect(text).not.toContain('Dimensions.get');
      expect(text).not.toContain('GlassCard');
      expect(text).not.toMatch(/fontSize:/);
      expect(text).not.toMatch(/fontWeight:/);
      expect(text).not.toMatch(/fontFamily:/);
      expect(text).not.toMatch(/textAlign:\s*'(left|right)'/);
      expect(text).not.toMatch(/(margin|padding)(Left|Right):/);
      expect(text).not.toContain('row-reverse');
      expect(text).not.toMatch(/\.\.\.typography\./);
    });

    it(`${file} keeps module-scope styles free of theme colors`, () => {
      const moduleStyles = code(file).match(/^const styles = StyleSheet\.create\(\{[\s\S]*?\n\}\);/m);
      if (moduleStyles) expect(moduleStyles[0]).not.toContain('colors.');
    });

    it(`${file} keeps the legacy AppText out of the profile stack`, () => {
      expect(src(file)).not.toContain("from '@/components/ui/AppText'");
    });
  }

  it('keeps the profile shell flat and content-first', () => {
    const layout = code('components/feature/ProfileScreenLayout.tsx');
    // Identity, stats, bio and tabs are composition, never stacked cards.
    expect(layout).not.toContain('SarhCard');
    expect(layout).not.toContain('shadow');
    expect(layout).not.toContain('elevation');
    // The card language on a profile comes from the ads tab content only.
    expect(layout).not.toContain('ListingCard');
    expect(layout).toContain('<Screen');
    expect(layout).toContain('stickyHeaderIndices');
  });

  it('keeps profile-linked settings on the flat row and section patterns', () => {
    const menu = src('components/feature/ProfileSettingsMenuScreen.tsx');
    expect(menu).toContain('SarhSettingsSection');
    expect(menu).toContain('SarhSettingsRow');
    expect(menu).toContain('gutter={false}');
    expect(menu).not.toContain('SarhCard');

    for (const file of [
      'app/profile/settings/account.tsx',
      'app/profile/settings/privacy.tsx',
      'app/settings/blocked.tsx',
    ]) {
      const text = code(file);
      expect(text).not.toContain('SarhCard');
      expect(text).not.toContain('LinearGradient');
      expect(text).toContain('SarhDivider');
    }
    expect(src('app/profile/settings/account.tsx')).toContain('<Section');
  });

  it('routes profile forms through the responsive form cap and DS inputs', () => {
    for (const file of [
      'app/profile/edit/index.tsx',
      'components/feature/ProfileFieldEditScreen.tsx',
      'app/profile/settings/account.tsx',
      'app/profile/settings/password.tsx',
      'app/profile/settings/change-phone.tsx',
    ]) {
      expect(src(file)).toContain('width="form"');
    }
    expect(src('components/feature/ProfileFieldEditScreen.tsx')).toContain('SarhInput');
    expect(src('app/profile/edit/index.tsx')).toContain('updateMe');
    expect(src('app/profile/edit/index.tsx')).toContain('sarhProfileShareUrl');
    expect(src('app/profile/edit/index.tsx')).toContain('copyToClipboard');
    expect(src('app/profile/edit/[field].tsx')).toContain('ProfileFieldEditScreen');
  });

  it('keeps profile chrome and its business logic untouched by the migration', () => {
    const layout = src('components/feature/ProfileScreenLayout.tsx');
    expect(layout).toContain('SarhBackButton');
    expect(layout).toContain('accessibilityLabel="المزيد"');
    expect(layout).toContain('مراسلة');
    expect(layout).toContain('متابعة');
    expect(layout).toContain('RefreshControl');

    const connections = src('app/profile/connections.tsx');
    expect(connections).toContain('fetchUserConnectionsWithMeta');
    expect(connections).toContain('setFollowUser');

    const account = src('app/profile/settings/account.tsx');
    expect(account).toContain('updateAccountSettings');
    expect(account).toContain('deleteAccount');
    expect(account).toContain('confirmDestructive');

    expect(src('app/profile/settings/privacy.tsx')).toContain('updatePrivacySettings');
    expect(src('app/profile/settings/change-phone.tsx')).toContain('changeAccountPhone');
    expect(src('app/profile/edit/index.tsx')).toContain('updateMe');
  });

  it('leaves the frozen feature components out of the profile migration', () => {
    for (const file of ['components/feature/PostItem.tsx', 'components/feature/ListingCard.tsx']) {
      expect(src(file)).not.toContain("from '@/design-system/layout'");
    }
    // Only the profile routes that render the feed may reference them.
    for (const file of WAVE_2_SHELLS) {
      expect(code(file)).not.toContain('PostItem');
      expect(code(file)).not.toContain('ListingCard');
    }
  });
});

const WAVE_3B_SHELLS = [
  'app/auth/phone.tsx',
  'app/auth/register.tsx',
  'app/auth/otp.tsx',
  'app/auth/forgot-password.tsx',
];

const WAVE_3B_LANDING = ['app/auth/welcome.tsx'];

const WAVE_3B = [...WAVE_3B_SHELLS, ...WAVE_3B_LANDING];

describe('Architecture V2 — Wave 3b auth and join screens', () => {
  for (const file of WAVE_3B) {
    it(`${file} composes its shell with the L2 layer`, () => {
      const text = src(file);
      expect(text).toContain("from '@/design-system/layout'");
      expect(text).toContain('<Screen');
      expect(text).toContain('<ScreenBody');
    });

    it(`${file} hands layout, RTL and type to the system`, () => {
      const text = code(file);
      expect(text).not.toContain('SafeAreaView');
      expect(text).not.toContain('AppScrollView');
      expect(text).not.toContain('KeyboardAvoidingView');
      expect(text).not.toContain('getRtlRow');
      expect(text).not.toContain('getRtlText');
      expect(text).not.toContain('getRtlDirection');
      expect(text).not.toContain('Dimensions.get');
      expect(text).not.toMatch(/fontSize:/);
      expect(text).not.toMatch(/fontWeight:/);
      expect(text).not.toMatch(/fontFamily:/);
      expect(text).not.toMatch(/textAlign:\s*'(left|right)'/);
      expect(text).not.toMatch(/(margin|padding)(Left|Right):/);
      expect(text).not.toContain('row-reverse');
      expect(text).not.toMatch(/\.\.\.typography\./);
    });

    it(`${file} keeps module-scope styles free of theme colors`, () => {
      const moduleStyles = code(file).match(/^const styles = StyleSheet\.create\(\{[\s\S]*?\n\}\);/m);
      if (moduleStyles) expect(moduleStyles[0]).not.toContain('colors.');
    });

    it(`${file} keeps the legacy AppText out of the auth/join stack`, () => {
      expect(src(file)).not.toContain("from '@/components/ui/AppText'");
    });
  }

  for (const file of WAVE_3B_SHELLS) {
    it(`${file} uses ScreenHeader for back chrome`, () => {
      expect(src(file)).toContain('<ScreenHeader variant="screen"');
    });
  }

  it('keeps labeled auth fields on SarhInput and the 440 auth cap', () => {
    for (const file of ['app/auth/phone.tsx', 'app/auth/register.tsx']) {
      expect(src(file)).toContain('SarhInput');
    }
    for (const file of WAVE_3B_SHELLS) {
      expect(src(file)).toContain('maxWidth: 440');
    }
  });
});

const WAVE_3C = [
  'app/notifications/index.tsx',
  'app/favorites.tsx',
  'app/news.tsx',
  'app/fees.tsx',
  'app/search.tsx',
  'app/payment.tsx',
  'app/payment/checkout.tsx',
  'app/payment/result.tsx',
  'app/payment/cancel.tsx',
];

describe('Architecture V2 — Wave 3c ready screens', () => {
  for (const file of WAVE_3C) {
    it(`${file} composes its shell with the L2 layer`, () => {
      const text = src(file);
      expect(text).toContain("from '@/design-system/layout'");
      expect(text).toContain('<Screen');
      expect(text).toContain('<ScreenBody');
    });

    it(`${file} hands layout, RTL and type to the system`, () => {
      const text = code(file);
      expect(text).not.toContain('SafeAreaView');
      expect(text).not.toContain('AppScrollView');
      expect(text).not.toContain('KeyboardAvoidingView');
      expect(text).not.toContain('getRtlRow');
      expect(text).not.toContain('getRtlText');
      expect(text).not.toContain('getRtlDirection');
      expect(text).not.toContain('Dimensions.get');
      expect(text).not.toMatch(/fontSize:/);
      expect(text).not.toMatch(/fontWeight:/);
      expect(text).not.toMatch(/fontFamily:/);
      expect(text).not.toMatch(/textAlign:\s*'(left|right)'/);
      expect(text).not.toMatch(/(margin|padding)(Left|Right):/);
      expect(text).not.toContain('row-reverse');
      expect(text).not.toMatch(/\.\.\.typography\./);
    });

    it(`${file} keeps module-scope styles free of theme colors`, () => {
      const moduleStyles = code(file).match(/^const styles = StyleSheet\.create\(\{[\s\S]*?\n\}\);/m);
      if (moduleStyles) expect(moduleStyles[0]).not.toContain('colors.');
    });
  }

  it('keeps subscription as a redirect-only legacy route', () => {
    const text = src('app/subscription.tsx');
    expect(text).toContain("router.replace('/promote'");
    expect(text).not.toContain('<Screen');
  });
});

const WAVE_4A_SCREENS = [
  'app/(tabs)/posts.tsx',
  'app/post/[id].tsx',
  'app/(tabs)/messages.tsx',
];

const WAVE_4A_PANEL = 'components/feature/MessagesPanel.tsx';

const WAVE_4A = [...WAVE_4A_SCREENS, WAVE_4A_PANEL];

describe('Architecture V2 — Wave 4A community and messages inbox', () => {
  for (const file of WAVE_4A_SCREENS) {
    it(`${file} composes its shell with the L2 layer`, () => {
      const text = src(file);
      expect(text).toContain("from '@/design-system/layout'");
      expect(text).toContain('<Screen');
      expect(text).toContain('<ScreenBody');
    });
  }

  for (const file of WAVE_4A) {
    it(`${file} hands layout, RTL and type to the system`, () => {
      const text = code(file);
      expect(text).not.toContain('SafeAreaView');
      expect(text).not.toContain('AppScrollView');
      expect(text).not.toContain('getRtlRow');
      expect(text).not.toContain('getRtlText');
      expect(text).not.toContain('getRtlDirection');
      expect(text).not.toContain('Dimensions.get');
      expect(text).not.toMatch(/fontSize:/);
      expect(text).not.toMatch(/fontWeight:/);
      expect(text).not.toMatch(/fontFamily:/);
      expect(text).not.toMatch(/textAlign:\s*'(left|right)'/);
      expect(text).not.toMatch(/(margin|padding)(Left|Right):/);
      expect(text).not.toContain('row-reverse');
      expect(text).not.toMatch(/\.\.\.typography\./);
    });

    it(`${file} keeps module-scope styles free of theme colors`, () => {
      const moduleStyles = code(file).match(/^const styles = StyleSheet\.create\(\{[\s\S]*?\n\}\);/m);
      if (moduleStyles) expect(moduleStyles[0]).not.toContain('colors.');
    });

    it(`${file} keeps the legacy AppText out of the Wave 4A shell`, () => {
      expect(src(file)).not.toContain("from '@/components/ui/AppText'");
    });
  }

  it('keeps composer keyboard avoidance on post detail because Screen.keyboard has no offset', () => {
    const detail = src('app/post/[id].tsx');
    expect(detail).toContain('ComposerKeyboardView');
    expect(detail).toContain('useComposerKeyboardPad');
    expect(detail).toContain('PostCommentsComposer');
    expect(src('components/ui/ComposerKeyboardView.tsx')).toContain('KeyboardAvoidingView');
    expect(src('components/ui/ComposerKeyboardView.tsx')).toContain("behavior=\"padding\"");
    expect(code('app/(tabs)/posts.tsx')).not.toContain('KeyboardAvoidingView');
    expect(code('app/(tabs)/messages.tsx')).not.toContain('KeyboardAvoidingView');
    expect(code(WAVE_4A_PANEL)).not.toContain('KeyboardAvoidingView');
  });

  it('shares resting composer insets across listing comments, post comments, and chat', () => {
    expect(src('components/feature/ListingCommentsModal.tsx')).toContain('ComposerKeyboardView');
    expect(src('components/feature/ListingCommentsModal.tsx')).toContain('useComposerKeyboardPad');
    expect(src('app/post/[id].tsx')).toContain('useComposerKeyboardPad');
    expect(src('app/chat.tsx')).toContain('useComposerKeyboardPad');
    const hook = src('hooks/useComposerKeyboardPad.ts');
    expect(hook).toContain('keyboardDidHide');
    expect(hook).toContain('restingBottom');
    expect(src('components/ui/ComposerKeyboardView.tsx')).toContain('enabled={Platform.OS === \'ios\' || keyboardVisible}');
  });

  it('wraps PostItem without taking ownership of the card', () => {
    expect(src('app/(tabs)/posts.tsx')).toContain('PostItem');
    expect(src('app/post/[id].tsx')).toContain('PostItem');
    expect(src('components/feature/PostItem.tsx')).toContain("from '@/components/ui/AppText'");
    expect(src('components/feature/PostItem.tsx')).not.toContain("from '@/design-system/components'");
  });

  it('keeps inbox navigation on the shared chat route', () => {
    const panel = src(WAVE_4A_PANEL);
    expect(panel).toContain("pathname: '/chat'");
    expect(panel).not.toContain("pathname: '/butchers/chat'");
    expect(panel).toContain('useMessageThreads');
    expect(panel).toContain('filterMessageThreads');
    expect(panel).toContain('SarhInput');
  });

  it('does not start the create-post wave', () => {
    expect(src('app/create/post.tsx')).not.toContain("from '@/design-system/layout'");
  });
});

const WAVE_4B_CHAT = 'app/chat.tsx';

describe('Architecture V2 — Wave 4B chat after malahem removal', () => {
  it('removes butcher marketplace screens from the Sarh app', () => {
    for (const file of [
      'app/butchers/index.tsx',
      'app/butchers/[id].tsx',
      'app/butchers/cart.tsx',
      'app/butchers/order.tsx',
      'app/join/index.tsx',
    ]) {
      expect(() => src(file)).toThrow();
    }
  });

  it('migrates the chat thread shell without taking Socket ownership', () => {
    const text = src(WAVE_4B_CHAT);
    expect(text).toContain("from '@/design-system/layout'");
    expect(text).toContain('<Screen');
    expect(text).toContain('ComposerKeyboardView');
    expect(text).toContain('useComposerKeyboardPad');
    expect(text).toContain('useChatThreadSocket');
    expect(text).toContain('applyChatSocketEvent');
    expect(text).toContain('mergeChatMessages');
    expect(text).toContain('pickAndSendMedia');
    expect(text).toContain('rtlInputText');
    expect(code(WAVE_4B_CHAT)).not.toContain('getRtlRow');
    expect(code(WAVE_4B_CHAT)).not.toContain('getRtlText');
    expect(code(WAVE_4B_CHAT)).not.toContain('SafeAreaView');
  });

  it('leaves Live and create-post media outside this wave', () => {
    expect(src('app/live/broadcast.tsx')).not.toContain("from '@/design-system/layout'");
    expect(src('app/create/post.tsx')).not.toContain("from '@/design-system/layout'");
    expect(src('components/feature/PostItem.tsx')).not.toContain("from '@/design-system/components'");
    expect(src('components/feature/PostMediaGallery.tsx')).not.toContain("from '@/design-system/layout'");
  });
});

const WAVE_4C = [
  'app/(tabs)/market.tsx',
  'app/market/browse.tsx',
  'app/market/categories/[id].tsx',
  'app/promote.tsx',
  'app/listing/[id].tsx',
  'app/create/listing.tsx',
];

describe('Architecture V2 — Wave 4C marketplace', () => {
  for (const file of WAVE_4C) {
    it(`${file} composes its shell with the L2 layer`, () => {
      const text = src(file);
      expect(text).toContain("from '@/design-system/layout'");
      expect(text).toContain('<Screen');
      expect(text).toContain('<ScreenBody');
    });

    it(`${file} hands RTL helpers to the system`, () => {
      const text = code(file);
      expect(text).not.toContain('SafeAreaView');
      expect(text).not.toContain('AppScrollView');
      expect(text).not.toContain('getRtlRow');
      expect(text).not.toContain('getRtlText');
      expect(text).not.toContain('getRtlDirection');
      expect(text).not.toContain('row-reverse');
      expect(text).not.toMatch(/(margin|padding)(Left|Right):/);
      expect(text).not.toMatch(/textAlign:\s*'(left|right)'/);
    });
  }

  it('keeps KeyboardAvoidingView on create listing and off the market grid', () => {
    expect(src('app/create/listing.tsx')).toContain('KeyboardAvoidingView');
    expect(code('app/(tabs)/market.tsx')).not.toContain('KeyboardAvoidingView');
    expect(code('app/listing/[id].tsx')).not.toContain('KeyboardAvoidingView');
  });

  it('wraps ListingCard without taking ownership of the card', () => {
    expect(src('components/market/MarketListingsFeed.tsx')).toContain('variant="list"');
    expect(src('components/market/MarketListingsFeed.tsx')).toContain('listMode="market"');
    expect(src('app/market/browse.tsx')).toContain('variant="list"');
    expect(src('app/market/browse.tsx')).not.toContain('getItemLayout');
    expect(src('components/feature/ListingCard.tsx')).toContain('export const ListingCard');
    expect(src('components/feature/ListingCard.tsx')).not.toContain("from '@/design-system/layout'");
  });

  it('keeps listing detail business contracts after the shell swap', () => {
    const detail = src('app/listing/[id].tsx');
    expect(detail).toContain('sarhListingShareUrl');
    expect(detail).toContain('openSellerChat');
    expect(detail).toContain('ListingCommentsSection');
    expect(detail).toContain('ListingFeePaymentSheet');
    expect(detail).toContain('ImageViewerModal');
    expect(detail).toContain('authFetch');
    expect(detail).toContain('weightLabel');
    expect(detail).toContain('كجم');
  });

  it('keeps create-listing field and submit contracts', () => {
    const create = src('app/create/listing.tsx');
    expect(create).toContain('موقع العرض');
    expect(create).toContain('عنوان العرض');
    expect(create).toContain('إعادة الاقتراح');
    expect(create).toContain('handleSubmit');
    expect(create).toContain('pickImages');
    expect(create).toContain('<SarhButton');
    expect(create).toContain('SarhInput');
    expect(create).toContain("label={needsWeight ? 'الوزن' : 'الوزن (اختياري)'}");
    expect(create).toContain('كجم');
  });
});

const WAVE_4D_SCREENS = [
  'app/(tabs)/index.tsx',
  'app/ministry/index.tsx',
  'app/ministry/services/[id].tsx',
];

const WAVE_4D_CHROME = [
  'components/ui/HomeAppBar.tsx',
  'components/feature/ExploreSarhSection.tsx',
  'components/feature/HomeCommunityPosts.tsx',
  'components/feature/HomeMinistryOrgCard.tsx',
  'components/feature/EditorialStoriesBar.tsx',
  'components/feature/MinistryServiceCard.tsx',
];

describe('Architecture V2 — Wave 4D home and explore', () => {
  for (const file of WAVE_4D_SCREENS) {
    it(`${file} composes its shell with the L2 layer`, () => {
      const text = src(file);
      expect(text).toContain("from '@/design-system/layout'");
      expect(text).toContain('<Screen');
      expect(text).toContain('<ScreenBody');
    });
  }

  for (const file of [...WAVE_4D_SCREENS, ...WAVE_4D_CHROME]) {
    it(`${file} hands RTL helpers to the system`, () => {
      const text = code(file);
      expect(text).not.toContain('SafeAreaView');
      expect(text).not.toContain('AppScrollView');
      expect(text).not.toContain('getRtlRow');
      expect(text).not.toContain('getRtlText');
      expect(text).not.toContain('getRtlDirection');
      expect(text).not.toContain('row-reverse');
      expect(text).not.toMatch(/(margin|padding)(Left|Right):/);
      expect(text).not.toMatch(/textAlign:\s*'(left|right)'/);
      expect(text).not.toMatch(/fontWeight:/);
      expect(text).not.toMatch(/fontSize:/);
    });
  }

  it('aligns Home chrome to the responsive gutter', () => {
    expect(src('components/ui/HomeAppBar.tsx')).toContain('useLayout');
    expect(src('components/ui/HomeAppBar.tsx')).toContain('paddingHorizontal: gutter');
    expect(src('components/feature/ExploreSarhSection.tsx')).toContain('paddingHorizontal: gutter');
    expect(src('components/feature/HomeCommunityPosts.tsx')).toContain('paddingHorizontal: gutter');
    expect(src('components/feature/HomeMinistryOrgCard.tsx')).toContain('marginHorizontal: gutter');
  });

  it('keeps Home fetch, section order, and official ministry routes', () => {
    const home = src('app/(tabs)/index.tsx');
    expect(home).not.toContain('ExploreSarhSection');
    expect(home).toContain('extraHeader={quickAccess}');
    expect(home.indexOf('<HomeQuickAccess')).toBeLessThan(home.indexOf('extraHeader={quickAccess}'));
    expect(home).not.toContain('<HomeFeedSuppliers');
    expect(home).not.toContain('ListingCard');
    expect(home).not.toContain('HomeMinistryOrgCard');
    expect(home).not.toContain('PostItem');
    expect(src('app/ministry/index.tsx')).toContain('PostItem');
    expect(src('app/ministry/index.tsx')).not.toContain('مراسلة');
    expect(src('app/ministry/services/[id].tsx')).toContain('Linking.openURL');
  });

  it('leaves story playback and frozen cards outside this wave', () => {
    expect(src('components/feature/EditorialStoryViewer.tsx')).not.toContain("from '@/design-system/layout'");
    expect(src('components/feature/StoryViewer.tsx')).not.toContain("from '@/design-system/layout'");
    expect(src('components/feature/PostItem.tsx')).not.toContain("from '@/design-system/layout'");
    expect(src('components/feature/ListingCard.tsx')).not.toContain("from '@/design-system/layout'");
    expect(src('app/live/broadcast.tsx')).not.toContain("from '@/design-system/layout'");
  });
});
