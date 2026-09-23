import {
  appFont,
  APP_FONT_FACES,
  APP_FONT_NAME,
  OFFICIAL_APP_FONT,
  resolveAppFontFace,
  resolveDesignFontFace,
  toLoadedFontStyle,
} from '@/constants/fonts';
import { typography } from '@/constants/theme';
import packageJson from '../package.json';
import { Platform } from 'react-native';

describe('resolveAppFontFace', () => {
  it('maps weights to Tajawal faces without forcing Bold', () => {
    expect(resolveAppFontFace('400')).toEqual({
      fontFamily: appFont.regular,
      fontWeight: '400',
    });
    expect(resolveAppFontFace('500')).toEqual({
      fontFamily: appFont.medium,
      fontWeight: '500',
    });
    expect(resolveAppFontFace('600')).toEqual({
      fontFamily: appFont.semibold,
      fontWeight: '600',
    });
    expect(resolveAppFontFace('700')).toEqual({
      fontFamily: appFont.bold,
      fontWeight: '700',
    });
    expect(resolveAppFontFace('normal', appFont.medium)).toEqual({
      fontFamily: appFont.regular,
      fontWeight: '400',
    });
  });

  it('keeps a separate design-system resolver with real Tajawal weights', () => {
    expect(resolveDesignFontFace('400')).toEqual({
      fontFamily: appFont.regular,
      fontWeight: '400',
    });
    expect(resolveDesignFontFace('500')).toEqual({
      fontFamily: appFont.medium,
      fontWeight: '500',
    });
    expect(resolveDesignFontFace('600')).toEqual({
      fontFamily: appFont.semibold,
      fontWeight: '600',
    });
    expect(resolveDesignFontFace('700')).toEqual({
      fontFamily: appFont.bold,
      fontWeight: '700',
    });
  });

  it('preserves monospace', () => {
    expect(resolveAppFontFace('600', 'monospace').fontFamily).toBe('monospace');
  });

  it('maps leftover IBM family names to Tajawal instead of preserving them', () => {
    expect(resolveAppFontFace('400', 'IBMPlexSansArabic_400Regular')).toEqual({
      fontFamily: appFont.regular,
      fontWeight: '400',
    });
    expect(resolveAppFontFace('700', 'IBMPlexSansArabic_700Bold')).toEqual({
      fontFamily: appFont.bold,
      fontWeight: '700',
    });
  });

  it('builds Android-safe loaded styles without numeric fontWeight', () => {
    const face = resolveAppFontFace('700');
    const style = toLoadedFontStyle(face);
    expect(style.fontFamily).toBe(appFont.bold);
    if (Platform.OS === 'android') {
      expect(style.fontWeight).toBe('normal');
    } else {
      expect(style.fontWeight).toBe('700');
    }
  });
});

describe('typography tokens', () => {
  it('maps content roles to weight-aware Tajawal faces', () => {
    expect(OFFICIAL_APP_FONT).toBe(appFont.bold);
    expect(typography.valueLarge.fontFamily).toBe(appFont.bold);
    expect(typography.feedTitle.fontFamily).toBe(appFont.semibold);
    expect(typography.feedBody.fontFamily).toBe(appFont.medium);
    expect(typography.body.fontFamily).toBe(appFont.medium);
    expect(typography.caption.fontFamily).toBe(appFont.medium);
    expect(typography.tab.fontFamily).toBe(appFont.bold);
    expect(typography.tabActive.fontFamily).toBe(appFont.bold);
    for (const token of Object.values(typography)) {
      const family = (token as { fontFamily?: string }).fontFamily;
      if (!family) continue;
      expect(APP_FONT_FACES).toContain(family);
    }
  });

  it('keeps size hierarchy while using Tajawal faces', () => {
    expect(typography.display).toMatchObject({
      fontSize: 24,
      fontFamily: appFont.bold,
      lineHeight: 32,
    });
    expect(typography.body).toMatchObject({
      fontSize: 16,
      fontFamily: appFont.medium,
      lineHeight: 24,
    });
    expect(typography.feedBody).toMatchObject({
      fontSize: 14,
      fontFamily: appFont.medium,
      lineHeight: 20,
    });
    expect(typography.tab).toMatchObject({ fontSize: 10, lineHeight: 13 });
  });

  it('registers Tajawal as the only app text face', () => {
    expect(APP_FONT_NAME).toBe('Tajawal');
    expect(APP_FONT_FACES).toEqual([
      'Tajawal_400Regular',
      'Tajawal_500Medium',
      'Tajawal_700Bold',
    ]);
  });
});

describe('package fonts', () => {
  it('depends on Tajawal only and does not ship IBM Plex', () => {
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    expect(deps['@expo-google-fonts/tajawal']).toBeTruthy();
    expect(Object.prototype.hasOwnProperty.call(deps, '@expo-google-fonts/ibm-plex-sans-arabic')).toBe(
      false,
    );
  });
});
