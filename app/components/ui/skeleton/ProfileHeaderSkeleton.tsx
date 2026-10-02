/**
 * Skeleton of the ProfileScreenLayout identity block (name, @handle, rating,
 * three stats, 88px avatar at the inline end) and, for visitors, the
 * Follow / Message pills. Used while the profile request is in flight so the
 * toolbar (back button), tabs and tab content keep their real positions.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { buttonMetrics, typography as ds } from '@/design-system';
import { radius, spacing } from '@/constants/theme';
import { getRtlRow } from '@/lib/rtl';
import { SkeletonBox, SkeletonCircle, SkeletonPulse, SkeletonText } from './SkeletonPrimitives';

/** = ProfileScreenLayout avatarPlain. */
export const PROFILE_AVATAR_SIZE = 88;

export function ProfileHeaderSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <SkeletonPulse style={[styles.row, getRtlRow(), style]}>
      <View style={styles.main}>
        <View style={styles.identity}>
          <SkeletonText fontSize={ds.heading3.fontSize} lineHeight={ds.heading3.lineHeight} widths={['58%']} />
          <SkeletonText fontSize={ds.caption.fontSize} lineHeight={ds.caption.lineHeight} widths={['32%']} />
          <View style={styles.rating}>
            <SkeletonText fontSize={ds.caption.fontSize} lineHeight={ds.caption.lineHeight} widths={[72]} />
          </View>
        </View>
        <View style={[styles.stats, getRtlRow()]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.stat}>
              <SkeletonText
                fontSize={ds.heading3.fontSize}
                lineHeight={ds.heading3.lineHeight}
                widths={[36]}
                align="center"
              />
              <SkeletonText
                fontSize={ds.caption.fontSize}
                lineHeight={ds.caption.lineHeight}
                widths={[52]}
                align="center"
              />
            </View>
          ))}
        </View>
      </View>
      <View style={styles.avatarCol}>
        <SkeletonCircle size={PROFILE_AVATAR_SIZE} />
      </View>
    </SkeletonPulse>
  );
}

/** Visitor Follow + Message pills (SarhButton md, pill). */
export function ProfileActionsSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <SkeletonPulse style={[styles.actions, getRtlRow(), style]}>
      <View style={styles.flex}>
        <SkeletonBox height={buttonMetrics.size.md.minHeight} radius={radius.pill} />
      </View>
      <View style={styles.flex}>
        <SkeletonBox height={buttonMetrics.size.md.minHeight} radius={radius.pill} />
      </View>
    </SkeletonPulse>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  main: {
    flex: 1,
    minHeight: 0,
    gap: spacing.sm,
  },
  identity: {
    gap: spacing.xs,
  },
  rating: {
    paddingVertical: 2,
  },
  stats: {
    width: '100%',
    paddingTop: spacing.xs,
  },
  stat: {
    flex: 1,
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  avatarCol: {
    paddingTop: 2,
  },
  actions: {
    gap: spacing.sm,
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  flex: {
    flex: 1,
  },
});
