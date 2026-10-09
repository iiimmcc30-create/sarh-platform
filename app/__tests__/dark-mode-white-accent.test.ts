/**
 * Dark mode = black & white identity: the former dark brand green (#24A86C) is
 * replaced by the Sarh logo white (#FBFBFB) as the accent, mirroring Light's
 * brand black. Anything drawn ON the accent uses black (`onElectric` / `onAccent`).
 */
import fs from 'fs';
import path from 'path';
import { sarh } from '@/constants/sarhTokens';
import { ds } from '@/constants/designSystem';
import { luxuryDark } from '@/constants/homeLuxury';
import { applyThemeScheme, colors as liveTheme, gradients } from '@/constants/theme';
import { colors, functional } from '@/design-system';
import {
  resolveSarhChipColors,
  resolveSarhIconButtonColors,
  resolveSarhInputBorder,
} from '@/design-system/components/resolvers';
import { contrastRatio } from '@/lib/chatBubbleTheme';
import { interactionRepostColor } from '@/lib/interactionActions';
import { planCardContentColor, planGradientColors } from '@/services/subscriptionPlans';

const WHITE = '#FBFBFB';
const BLACK = '#020202';
const DARK_SURFACES = ['#020202', '#0A0B0C', '#16181C', '#1D1F23'];
const ROOT = path.join(__dirname, '..');
const src = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('Dark mode white accent', () => {
  afterEach(() => applyThemeScheme('dark'));

  it('dark accent tokens are white-based', () => {
    expect(sarh.color.action).toBe(WHITE);
    expect(sarh.color.actionPressed).toBe(sarh.color.primaryActionPressed);
    expect(sarh.color.actionMuted).toBe('rgba(251, 251, 251, 0.14)');
    expect(sarh.color.success).toBe(WHITE);
    expect(sarh.color.onAction).toBe(BLACK);
    expect(luxuryDark.accentGlow).toBe('rgba(251, 251, 251, 0.22)');
    expect(ds.dark.primary).toBe(WHITE);
    expect(ds.dark.accent).toBe(WHITE);
    expect(ds.dark.glow).toBe(WHITE);
  });

  it('live Dark theme: accent, success, links, tabs and focus are white; foreground on accent is black', () => {
    applyThemeScheme('dark');
    for (const key of ['electric', 'electricBright', 'glow', 'cyan', 'emerald', 'success'] as const) {
      expect(liveTheme[key]).toBe(WHITE);
    }
    expect(liveTheme.onElectric).toBe(BLACK);
    expect(gradients.electric[0]).toBe(WHITE);
    expect(colors.primary).toBe(WHITE);
    expect(colors.success).toBe(WHITE);
    expect(functional.primaryMuted).toBe(sarh.color.actionMuted);
    expect(functional.onAccent).toBe(BLACK);
    // Focused input border (login and every SarhInput) is white, not green.
    expect(resolveSarhInputBorder('focused')).toBe(WHITE);
    // Selected chips / icon buttons: white fill, black content.
    expect(resolveSarhChipColors(true).backgroundColor).toBe(WHITE);
    expect(resolveSarhChipColors(true).textOverride).toBe(BLACK);
    expect(resolveSarhIconButtonColors('selected').contentColor).toBe(BLACK);
    // Reposted glyph on theme surfaces.
    expect(interactionRepostColor('dark')).toBe(WHITE);
  });

  it('Light keeps white-on-black for the same tokens', () => {
    applyThemeScheme('light');
    expect(liveTheme.electric).toBe(BLACK);
    expect(liveTheme.onElectric).toBe('#FFFFFF');
    expect(functional.onAccent).toBe('#FFFFFF');
    expect(resolveSarhChipColors(true).textOverride).toBe('#FFFFFF');
  });

  it('foreground on the accent and the accent on dark surfaces meet WCAG AA', () => {
    expect(contrastRatio(sarh.color.onAction, sarh.color.action)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(sarh.color.onAction, sarh.color.actionPressed)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio('#FFFFFF', sarh.color.lightAction)).toBeGreaterThanOrEqual(7);
    for (const bg of DARK_SURFACES) {
      expect(contrastRatio(sarh.color.action, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('presence dot stays green; paid plan card is white with black text in Dark', () => {
    applyThemeScheme('dark');
    expect(functional.presence).toBe(sarh.color.darkStatusGreen);
    expect(sarh.color.darkStatusGreen).toBe('#24A86C');
    expect(planGradientColors(1, 'dark')).toEqual([WHITE, sarh.color.actionPressed]);
    expect(planCardContentColor(1, 'dark')).toBe(BLACK);
    expect(planCardContentColor(1, 'light')).toBe('#FFFFFF');
    expect(planCardContentColor(0, 'dark')).toBe('#FFFFFF');
    expect(
      contrastRatio(planCardContentColor(1, 'dark'), planGradientColors(1, 'dark')[1]),
    ).toBeGreaterThanOrEqual(7);
  });

  it('switch thumbs turn black on the white track when on', () => {
    expect(src('design-system/components/SarhSettingsRow.tsx')).toContain(
      'thumbColor={switchValue ? functional.onAccent : functional.onPrimary}',
    );
    expect(src('components/feature/SidebarMenu.tsx')).toContain(
      "thumbColor={value ? colors.onElectric : '#FFFFFF'}",
    );
    expect(src('components/feature/chat/ChatActionsSheet.tsx')).toContain(
      "thumbColor={muted ? colors.onElectric : '#FFFFFF'}",
    );
    expect(src('app/councils/create.tsx')).toContain("thumbColor={mods[t.key] ? colors.onElectric : '#fff'}");
    expect(src('design-system/components/SarhSettingsRow.tsx')).toContain(
      'thumbColor={switchValue ? functional.onAccent : functional.onPrimary}',
    );
  });

  it('icons/labels on accent fills use onElectric instead of hardcoded white', () => {
    const files = [
      'components/ui/SidebarMenuItem.tsx',
      'components/ui/filterChipAppearance.tsx',
      'components/feature/RatingModal.tsx',
      'components/listing/SarhListingCovenantModal.tsx',
      'components/listing/ListingFeePaymentSheet.tsx',
      'components/feature/LiveStreamItem.tsx',
      'components/feature/ListingCommentsModal.tsx',
      'components/feature/StoriesBar.tsx',
      'components/feature/SidebarMenu.tsx',
      'app/live/create.tsx',
      'components/feature/StoryVideoTrimmer.tsx',
      'app/live/watch/[id].tsx',
      // MarketCategoryPicker / RegionCityPicker: no accent «تطبيق» button — tapping a row applies and closes.
      'app/(tabs)/more.tsx',
      'components/feature/StoryViewer.tsx',
      'components/feature/PostCommentsSection.tsx',
      'components/feature/collections/CollectionCreateFab.tsx',
      'components/feature/MessagesPanel.tsx',
      'app/create/post.tsx',
      'app/create/story.tsx',
      'app/listing/[id].tsx',
      'components/feature/LocationMapPreview.tsx',
      // ProfileScreenLayout: no accent-filled icon since the avatar camera shortcut was removed.
      'app/auth/register.tsx',
      'app/auth/otp.tsx',
    ];
    for (const rel of files) {
      expect({ rel, ok: src(rel).includes('onElectric') }).toEqual({ rel, ok: true });
    }
    const payment = src('app/payment.tsx');
    expect(payment).toContain('planCardContentColor(plan.sortOrder, scheme)');
    expect(payment).toContain('color={functional.onAccent}');
  });

  it('no old dark green (or other accent greens) hardcoded outside the token file, except documented exceptions', () => {
    const GREEN =
      /#24A86C|#1D8958|#34D399|#10B981|#22C55E|#00BA7C|#25D366|rgba\(\s*36,\s*168,\s*108|rgba\(\s*52,\s*211,\s*153/i;
    // Documented exceptions: X-style repost green on the dark media viewer overlay
    // (white would equal the idle glyph) and the official WhatsApp brand colour.
    const allowed = new Set([
      path.join('constants', 'sarhTokens.ts'),
      path.join('lib', 'interactionActions.ts'),
      path.join('components', 'feed-suppliers', 'FeedSupplierContactActions.tsx'),
    ]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '__tests__', 'android', 'ios', 'dist', '.expo'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const rel = path.relative(ROOT, full);
          if (allowed.has(rel)) continue;
          if (GREEN.test(fs.readFileSync(full, 'utf8'))) offenders.push(rel);
        }
      }
    };
    for (const dir of ['app', 'components', 'constants', 'design-system', 'hooks', 'lib', 'services']) {
      walk(path.join(ROOT, dir));
    }
    expect(offenders).toEqual([]);
  });
});
