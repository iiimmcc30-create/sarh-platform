/**
 * Skeleton of the ProfileScreenLayout identity block, in the same order as the
 * real header: 88px avatar at the inline start (right in Arabic), name with the
 * rating on the opposite side, @handle, then the compact pill-sized stats block
 * at the inline start. For visitors, the Follow / Message pills.
 * Used while the profile request is in flight so the toolbar (back button),
 * tabs and tab content keep their real positions.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { buttonMetrics, typography as ds } from '@/design-system';
import { radius, spacing } from '@/constants/theme';
import {
  PROFILE_ACTION_PILL_GAP,
  PROFILE_STATS_HEIGHT,
} from '@/lib/profileHeader';
import { getRtlRow } from '@/lib/rtl';
import { SkeletonBox, SkeletonCircle, SkeletonPulse, SkeletonText } from './SkeletonPrimitives';

/** = ProfileScreenLayout avatarPlain. */
export const PROFILE_AVATAR_SIZE = 88;

export function ProfileHeaderSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <SkeletonPulse style={[styles.main, style]}>
      <View style={[styles.avatarRow, getRtlRow()]}>
        <SkeletonCircle size={PROFILE_AVATAR_SIZE} />
      </View>
      <View style={styles.identity}>
        <View style={[styles.nameRow, getRtlRow()]}>
          <View style={styles.flex}>
            <SkeletonText fontSize={ds.heading3.fontSize} lineHeight={ds.heading3.lineHeight} widths={['70%']} />
          </View>
          <SkeletonText fontSize={ds.caption.fontSize} lineHeight={ds.caption.lineHeight} widths={[72]} />
        </View>
        <SkeletonText fontSize={ds.label.fontSize} lineHeight={ds.label.lineHeight} widths={['32%']} />
      </View>
      <View style={[styles.statsRow, getRtlRow()]}>
        <View style={[styles.statsBlock, getRtlRow()]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.stat}>
              <SkeletonText
                fontSize={ds.label.fontSize}
                lineHeight={ds.label.lineHeight}
                widths={[24]}
                align="center"
              />
              <SkeletonText
                fontSize={ds.micro.fontSize}
                lineHeight={ds.micro.lineHeight}
                widths={[40]}
                align="center"
              />
            </View>
          ))}
        </View>
        <View style={styles.flex} />
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
  main: {
    gap: spacing.sm,
  },
  /** = ProfileScreenLayout avatarCol overlap over the cover. */
  avatarRow: {
    marginTop: -44,
    paddingTop: 2,
  },
  identity: {
    gap: spacing.xs,
  },
  nameRow: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  statsRow: {
    width: '100%',
    gap: PROFILE_ACTION_PILL_GAP,
    paddingTop: spacing.xs,
  },
  /** = ProfileScreenLayout statsBlock: one pill slot wide, pill height. */
  statsBlock: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    height: PROFILE_STATS_HEIGHT,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
