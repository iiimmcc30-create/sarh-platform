import { AppIcon } from '@/components/ui/FlaticonIcon';
import { SidebarMenuItem } from '@/components/ui/SidebarMenuItem';
import { BrandSwitch, menuCardStyle } from '@/components/feature/SidebarMenu';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppScrollView } from '@/components/ui/AppScrollView';
import { ds } from '@/constants/designSystem';
import { LOCALE_STORAGE_KEY, type AppLocale, normalizeAppLocale } from '@/lib/locale';
import { setupRtl } from '@/lib/rtl';
import { safePush } from '@/lib/safeNavigate';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  DevSettings,
  I18nManager,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CoverTrailRow } from '@/components/ui/CoverTrailRow';
import { AppText } from '@/components/ui/AppText';

const TAB_CLEARANCE = ds.tabBar.height + ds.tabBar.fabLift + ds.space.xxl + 24;
const APP_STORE_URL = 'https://apps.apple.com/app/id0000000000';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.sarh.app';

function openStoreRating() {
  const url = Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
  Linking.openURL(url).catch(() => {});
}

export default function MoreScreen() {
  const router = useRouter();
  const { preference, setPreference, colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [locale, setLocale] = useState<AppLocale>('ar');
  const isDark = preference !== 'light';

  useEffect(() => {
    void AsyncStorage.getItem(LOCALE_STORAGE_KEY).then((v) => {
      setLocale(normalizeAppLocale(v));
    });
  }, []);

  const onToggleTheme = useCallback(
    (next: boolean) => {
      void setPreference(next ? 'dark' : 'light');
    },
    [setPreference],
  );

  const onSelectLocale = useCallback(
    async (next: AppLocale) => {
      if (next === locale) return;
      await AsyncStorage.setItem(LOCALE_STORAGE_KEY, next);
      setLocale(next);
      const needsRtl = next === 'ar';
      if (I18nManager.isRTL !== needsRtl) {
        setupRtl(next);
        Alert.alert('تغيير اللغة', 'سيتم تطبيق اتجاه الواجهة بعد إعادة تشغيل التطبيق.', [
          {
            text: 'حسنًا',
            onPress: () => {
              try {
                DevSettings.reload();
              } catch {
                /* cold start will apply */
              }
            },
          },
        ]);
      }
    },
    [locale],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="المزيد" />
      <AppScrollView contentContainerStyle={styles.content}>
        <View style={styles.sectionLabelWrap}>
          <View style={{ width: '100%' }}>
            <AppText style={styles.sectionLabel}>عام</AppText>
          </View>
        </View>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <CoverTrailRow justify="flex-end" gap={10} style={styles.coverTrail}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText style={styles.cardTitle}>اللغة</AppText>
              </View>
              <AppIcon name="globe-outline" size={22} color={colors.textPrimary} />
            </CoverTrailRow>
          </View>
          <View style={styles.langTrack}>
            <Pressable
              onPress={() => void onSelectLocale('ar')}
              style={[styles.langOption, locale === 'ar' && styles.langOptionActive]}
            >
              <Text style={[styles.langText, locale === 'ar' && styles.langTextActive]}>عربي</Text>
            </Pressable>
            <Pressable
              onPress={() => void onSelectLocale('en')}
              style={[styles.langOption, locale === 'en' && styles.langOptionActive]}
            >
              <Text style={[styles.langText, locale === 'en' && styles.langTextActive]}>ENGLISH</Text>
            </Pressable>
          </View>
          <View style={[styles.insetDivider, { backgroundColor: colors.borderSoft }]} />
          <View style={styles.switchRow}>
            <BrandSwitch value={isDark} onValueChange={onToggleTheme} colors={colors} />
            <CoverTrailRow justify="flex-end" gap={10} style={styles.coverTrail}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText style={styles.rowTitle}>المظهر</AppText>
              </View>
              <AppIcon name="weather-night" size={22} color={colors.textPrimary} />
            </CoverTrailRow>
          </View>
        </View>

        <View style={styles.sectionLabelWrap}>
          <View style={{ width: '100%' }}>
            <AppText style={styles.sectionLabel}>المحفوظات</AppText>
          </View>
        </View>
        <View style={styles.card}>
          <SidebarMenuItem
            icon="heart"
            title="المفضلة"
            colors={colors}
            showDivider={false}
            onPress={() => safePush('/favorites', undefined, router)}
          />
        </View>

        <View style={styles.sectionLabelWrap}>
          <View style={{ width: '100%' }}>
            <AppText style={styles.sectionLabel}>عن سرح</AppText>
          </View>
        </View>
        <View style={styles.card}>
          <SidebarMenuItem
            icon="information-outline"
            title="من نحن"
            colors={colors}
            showDivider
            onPress={() => safePush('/info/about', undefined, router)}
          />
          <SidebarMenuItem
            icon="file-document-outline"
            title="السياسات والشروط"
            colors={colors}
            showDivider
            onPress={() => safePush('/info/policies', undefined, router)}
          />
          <SidebarMenuItem
            icon="mail-outline"
            title="تواصل معنا"
            colors={colors}
            showDivider={false}
            onPress={() => safePush('/info/contact', undefined, router)}
          />
        </View>

        <View style={styles.sectionLabelWrap}>
          <View style={{ width: '100%' }}>
            <AppText style={styles.sectionLabel}>المساعدة</AppText>
          </View>
        </View>
        <View style={styles.card}>
          <SidebarMenuItem
            icon="lifebuoy"
            title="الدعم والمساعدة"
            colors={colors}
            showDivider
            onPress={() => safePush('/support', undefined, router)}
          />
          <SidebarMenuItem
            icon="star-outline"
            title="تقييم التطبيق"
            colors={colors}
            showDivider={false}
            onPress={openStoreRating}
          />
        </View>
      </AppScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.screenRoot },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: TAB_CLEARANCE,
      gap: spacing.md,
    },
    card: menuCardStyle(colors),
    switchRow: {
      flexDirection: 'row',
            alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: 14,
      gap: spacing.md,
    },
    coverTrail: { flex: 1, minWidth: 0 },
    rowTitle: { ...typography.cardHeading, color: colors.textPrimary },
    insetDivider: {
      height: StyleSheet.hairlineWidth,
      marginHorizontal: spacing.lg,
    },
    cardHeader: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    cardTitle: { ...typography.smallHeading, color: colors.textPrimary },
    langTrack: {
      flexDirection: 'row',
      backgroundColor: colors.bgDeep,
      borderRadius: 12,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      padding: 4,
      gap: 4,
    },
    langOption: {
      flex: 1,
      minHeight: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    langOptionActive: { backgroundColor: colors.success },
    langText: { ...typography.badge, color: colors.textMuted },
    langTextActive: { color: '#FFFFFF' },
    sectionLabelWrap: { marginTop: spacing.xs, paddingHorizontal: 4 },
    sectionLabel: { ...typography.bodyStrong, color: colors.textMuted },
  });
}
