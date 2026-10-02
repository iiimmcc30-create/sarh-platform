/**
 * Skeleton of components/notifications/NotificationCard: same card chrome
 * (radius xl, hairline, padding lg, shadow), title (bodyStrong), two body
 * lines (body / 22), time (caption) and the small chevron slot at the end.
 */
import { StyleSheet, View } from 'react-native';
import { ambientShadow, ds } from '@/constants/designSystem';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import { SkeletonBox, SkeletonPulse, SkeletonText } from './SkeletonPrimitives';

export function NotificationCardSkeleton() {
  const styles = useThemedStyles(({ colors, scheme }) => createStyles(colors, scheme));
  return (
    <View style={styles.card}>
      <SkeletonPulse style={getRtlRow()}>
        <View style={styles.content}>
          <SkeletonText
            fontSize={typography.bodyStrong.fontSize}
            lineHeight={typography.bodyStrong.lineHeight}
            widths={['64%']}
          />
          <SkeletonText fontSize={typography.body.fontSize} lineHeight={22} lines={2} widths={['100%', '70%']} />
          <SkeletonText
            fontSize={typography.caption.fontSize}
            lineHeight={typography.caption.lineHeight}
            widths={['30%']}
          />
        </View>
        <SkeletonBox width={ds.icon.sm} height={ds.icon.sm} radius={ds.icon.sm / 2} style={styles.chevron} />
      </SkeletonPulse>
    </View>
  );
}

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  const tokens = scheme === 'light' ? ds.light : ds.dark;
  return StyleSheet.create({
    card: {
      backgroundColor: colors.bgSurface,
      borderRadius: ds.radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.stroke,
      padding: spacing.lg,
      marginBottom: spacing.md,
      ...ambientShadow(scheme, 'soft'),
    },
    content: {
      flex: 1,
      gap: spacing.sm,
    },
    chevron: {
      marginTop: spacing.xs,
      marginEnd: spacing.xs,
    },
  });
}

export default NotificationCardSkeleton;
