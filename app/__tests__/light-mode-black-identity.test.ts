/**
 * Light mode = black & white identity: the former brand green is replaced by the
 * Sarh brand black (#020202) on light surfaces, while Dark keeps its green.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { sarh } from '@/constants/sarhTokens';
import { applyThemeScheme, colors as liveTheme } from '@/constants/theme';
import { functional } from '@/design-system';
import { INTERACTION_REPOST_GREEN, interactionRepostColor } from '@/lib/interactionActions';
import { planGradientColors } from '@/services/subscriptionPlans';

const src = (rel: string) =>
  readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('Light mode black identity', () => {
  afterEach(() => applyThemeScheme('dark'));

  it('toggles, success and links resolve to black in Light, green stays in Dark', () => {
    applyThemeScheme('light');
    expect(liveTheme.success).toBe('#020202');
    expect(liveTheme.textBrandStrong).toBe('#020202');
    expect(liveTheme.textBrandSuccess).toBe('#020202');
    applyThemeScheme('dark');
    expect(liveTheme.success).toBe(sarh.color.success);
    expect(liveTheme.electric).toBe(sarh.color.action);
  });

  it('keeps the avatar presence dot green in both schemes', () => {
    applyThemeScheme('light');
    expect(functional.presence).toBe(sarh.color.statusGreen);
    applyThemeScheme('dark');
    expect(functional.presence).toBe(sarh.color.success);
    expect(src('design-system/components/SarhAvatar.tsx')).toContain(
      'backgroundColor: functional.presence',
    );
  });

  it('reposted state is black on Light theme surfaces, green in Dark', () => {
    expect(interactionRepostColor('light')).toBe('#020202');
    expect(interactionRepostColor('dark')).toBe(INTERACTION_REPOST_GREEN);
    expect(src('components/feature/PostItem.tsx')).toContain(
      'post.reposted ? interactionRepostColor(scheme) : colors.textSecondary',
    );
    expect(src('components/feature/ProfileRepostAttribution.tsx')).toContain(
      'color={interactionRepostColor(scheme)}',
    );
  });

  it('paid plan card is black in Light and keeps the former green in Dark', () => {
    expect(planGradientColors(1, 'light')).toEqual([
      sarh.color.lightAction,
      sarh.color.lightActionPressed,
    ]);
    expect(planGradientColors(1, 'dark')).toEqual(['#1C8354', '#176B44']);
    expect(planGradientColors(0, 'light')).toEqual(['#334155', '#1E293B']);
    expect(src('app/payment.tsx')).toContain('planGradientColors(plan.sortOrder, scheme)');
  });

  it('dark overlays never use the Light brand black for text/spinners', () => {
    const watch = src('app/live/watch/[id].tsx');
    expect(watch).toContain("scheme === 'light' ? sarh.color.text : colors.electricBright");
    expect(watch).toContain('bubbleUser:   { ...typography.badge, color: sarh.color.text');
    const story = src('components/feature/EditorialStoryViewer.tsx');
    expect(story).toContain("scheme === 'light' && styles.moreTextLight");
    expect(story).toContain('const LIGHT_SCHEME_LINK = sarh.color.primaryText;');
  });

  it('routes the remaining hardcoded greens through tokens', () => {
    expect(src('app/chat.tsx')).toContain('borderColor: `${colors.electric}59`');
    expect(src('components/feature/ProfileScreenLayout.tsx')).toContain(
      "scheme === 'light' ? themeColors.glow : '#34D399'",
    );
  });
});
