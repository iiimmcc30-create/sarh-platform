import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { AppText } from '@/components/ui/AppText';
import { AppScrollView } from '@/components/ui/AppScrollView';
import { AppText as DsText, SarhDivider } from '@/design-system/components';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useAppUser } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { getRtlRow } from '@/lib/rtl';
import { closeThen, closeThenPush } from '@/lib/safeNavigate';
import { navigateToCreateListing } from '@/lib/navigateToCreateListing';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type NavItem = {
  key: string;
  icon: string;
  label: string;
  route: string;
};

const PRIMARY_ITEMS: NavItem[] = [
  { key: 'profile', icon: 'person-outline', label: 'الملف الشخصي', route: '/(tabs)/profile' },
  { key: 'create-listing', icon: 'add-circle-outline', label: 'إضافة عرض', route: '/create/listing' },
  { key: 'favorites', icon: 'heart-outline', label: 'المفضلة', route: '/favorites' },
  { key: 'feed-suppliers', icon: 'leaf', label: 'موردو الأعلاف', route: '/feed-suppliers' },
  { key: 'ministry', icon: 'briefcase-outline', label: 'خدمات الوزارة', route: '/ministry?tab=services' },
  { key: 'news', icon: 'newspaper-outline', label: 'قطاع الأخبار', route: '/news' },
  { key: 'promote', icon: 'megaphone-outline', label: 'الترويج', route: '/promote' },
];

const SECONDARY_ITEMS: NavItem[] = [
  { key: 'info', icon: 'information-outline', label: 'مركز المعلومات', route: '/settings/info' },
  { key: 'settings', icon: 'settings-outline', label: 'الإعدادات والخصوصية', route: '/profile/settings' },
  { key: 'help', icon: 'lifebuoy', label: 'مركز المساعدة', route: '/support' },
];

type AppSidebarProps = {
  onClose: () => void;
};

export function AppSidebar({ onClose }: AppSidebarProps) {
  const { colors, preference, setPreference } = useTheme();
  const { me } = useAppUser();
  const { isAuthenticated } = useAuth();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const isDark = preference !== 'light';

  const displayName = isAuthenticated
    ? me.arabicName || me.displayName || me.username || 'حسابي'
    : 'ضيف';
  const username = isAuthenticated && me.username ? `@${me.username}` : '@guest';
  const followingCount = isAuthenticated ? me.following ?? 0 : 0;
  const followersCount = isAuthenticated ? me.followers ?? 0 : 0;

  const go = (route: string) => {
    closeThenPush(route);
  };

  const goCreateListing = () => {
    closeThen(() => {
      void navigateToCreateListing({ requireCovenant: true });
    });
  };

  return (
    <SafeAreaView style={styles.panel} edges={['top', 'bottom']}>
      <View style={[styles.closeRow, getRtlRow()]}>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="إغلاق القائمة"
          style={styles.closeBtn}
        >
          <AppIcon name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <AppScrollView contentContainerStyle={styles.scroll}>
        <Pressable
          onPress={() => go('/(tabs)/profile')}
          style={styles.header}
          accessibilityRole="button"
          accessibilityLabel={displayName}
        >
          <Image source={uriSource(me.avatar)} style={styles.avatar} contentFit="cover" />
          <AppText style={styles.name} numberOfLines={2}>
            {displayName}
          </AppText>
          <AppText style={styles.handle} numberOfLines={1}>
            {username}
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => go('/profile/connections')}
          style={[styles.statsRow, getRtlRow()]}
          accessibilityRole="button"
          accessibilityLabel={`${followingCount} يتابع، ${followersCount} متابعون`}
        >
          <AppText style={styles.statValue}>{followingCount}</AppText>
          <AppText style={styles.statLabel}>يتابع</AppText>
          <AppText style={styles.statValue}>{followersCount}</AppText>
          <AppText style={styles.statLabel}>متابعون</AppText>
        </Pressable>

        <SarhDivider accessibilityLabel="فاصل القائمة" />

        {PRIMARY_ITEMS.map((item) => (
          <Pressable
            key={item.key}
            onPress={() =>
              item.key === 'create-listing' ? goCreateListing() : go(item.route)
            }
            style={({ pressed }) => [styles.row, getRtlRow(), pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <AppIcon name={item.icon} size={24} color={colors.textPrimary} />
            <AppText style={styles.rowLabel}>{item.label}</AppText>
          </Pressable>
        ))}

        <SarhDivider accessibilityLabel="فاصل أقسام المساعدة" />

        {SECONDARY_ITEMS.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => go(item.route)}
            style={({ pressed }) => [styles.row, getRtlRow(), pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <AppIcon name={item.icon} size={20} color={colors.textPrimary} />
            <DsText variant="bodySmall" color="textSecondary" style={styles.secondaryLabel}>
              {item.label}
            </DsText>
          </Pressable>
        ))}
      </AppScrollView>

      <View style={[styles.footer, getRtlRow()]}>
        <Pressable
          onPress={() => void setPreference(isDark ? 'light' : 'dark')}
          style={styles.themeBtn}
          accessibilityRole="button"
          accessibilityLabel="المظهر"
        >
          <AppIcon name="weather-night" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    panel: {
      width: '82%',
      maxWidth: 340,
      height: '100%',
      backgroundColor: colors.screenRoot,
    },
    closeRow: {
      justifyContent: 'flex-end',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
    },
    closeBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    header: {
      alignItems: 'flex-start',
      gap: 2,
      paddingTop: spacing.xs,
      paddingBottom: spacing.sm,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.bgSurface,
      marginBottom: spacing.sm,
    },
    name: {
      ...typography.sectionHeading,
      color: colors.textPrimary,
    },
    handle: {
      ...typography.feedBody,
      color: colors.textMuted,
    },
    statsRow: {
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
      marginBottom: spacing.lg,
    },
    statValue: {
      ...typography.caption,
      color: colors.textPrimary,
    },
    statLabel: {
      ...typography.caption,
      color: colors.textMuted,
    },
    row: {
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      paddingVertical: 12,
    },
    rowLabel: {
      ...typography.sectionHeading,
      color: colors.textPrimary,
      flex: 1,
    },
    secondaryLabel: {
      flex: 1,
    },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      paddingTop: spacing.xs,
    },
    themeBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.72,
    },
  });
}

export default AppSidebar;
