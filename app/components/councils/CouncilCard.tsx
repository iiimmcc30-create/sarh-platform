import { Pressable, StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText, SarhAvatar } from '@/design-system/components';
import { Row, Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { CouncilTierTag } from './CouncilTierTag';
import { subscriberTierOf } from '@/lib/subscriberTier';
import { resolveMediaUrl } from '@/services/media';
import {
  COUNCIL_FOLLOWERS_ONLY_LABEL,
  COUNCIL_GOLDEN_LABEL,
  COUNCIL_LOCKED_LABEL,
  councilHandle,
  councilListenersLabel,
  councilUserName,
  formatCouncilCount,
  type CouncilCard as CouncilCardData,
} from '@/services/councils';

type Props = { council: CouncilCardData; onPress: (c: CouncilCardData) => void };

/** How much neighbouring avatars in the speaker stack overlap. */
const AVATAR_OVERLAP = 10;

/**
 * External list card — X Spaces anatomy (title → live/listeners → host row +
 * overlapping avatars), Arabic RTL, Sarh black/white surfaces (no purple wash).
 */
export function CouncilCard({ council, onPress }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const hostTier = subscriberTierOf(council.owner);
  const hostName = councilUserName(council.owner);
  const preview = council.speakersPreview.slice(0, 4);

  return (
    <Pressable
      testID={
        hostTier === 'gold'
          ? 'council-card-gold'
          : hostTier === 'blue' || hostTier === 'blue_plus'
            ? 'council-card-blue'
            : undefined
      }
      onPress={() => onPress(council)}
      style={({ pressed }) => [
        styles.card,
        // Gold host: solid gold hairline + faint gold wash + gold top rule (flat, no gradient).
        hostTier === 'gold' && { borderColor: colors.tierGold },
        hostTier === 'gold' && styles.goldCard,
        // Blue / Blue+ host: a subtle blue hairline and the faintest blue wash.
        (hostTier === 'blue' || hostTier === 'blue_plus') && styles.blueCard,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`مجلس ${council.name}`}
    >
      {hostTier === 'gold' ? <View style={styles.goldRule} testID="council-card-gold-rule" /> : null}

      <Stack gap="sm" style={styles.body}>
        <AppText variant="heading2" color="textPrimary" numberOfLines={3} style={styles.title}>
          {council.name}
        </AppText>

        {council.description ? (
          <AppText variant="bodySmall" color="textSecondary" numberOfLines={2}>
            {council.description}
          </AppText>
        ) : null}

        <Row gap="sm" align="center" style={styles.meta} wrap>
          <Row gap="xs" align="center" style={styles.livePill}>
            <View style={styles.liveDot} />
            <AppText variant="caption" style={styles.liveText}>
              مباشر
            </AppText>
          </Row>
          <AppText variant="caption" color="textSecondary">
            {formatCouncilCount(council.listenerCount)} يستمعون
          </AppText>
          {council.locked || council.visibility === 'PRIVATE' ? (
            <Row gap="xs" align="center" testID="council-card-locked">
              <AppIcon name="lock-closed-outline" size={12} color={colors.textMuted} />
              <AppText variant="caption" color="textMuted">
                {COUNCIL_LOCKED_LABEL}
              </AppText>
            </Row>
          ) : null}
          {council.golden ? (
            <Row gap="xs" align="center" testID="council-card-golden">
              <AppIcon name="videocam-outline" size={12} color={colors.tierGold} />
              <AppText variant="caption" color="textMuted">
                {COUNCIL_GOLDEN_LABEL}
              </AppText>
            </Row>
          ) : null}
          {council.followersOnly ? (
            <Row gap="xs" align="center" testID="council-card-followers-only">
              <AppIcon name="people-outline" size={12} color={colors.textMuted} />
              <AppText variant="caption" color="textMuted">
                {COUNCIL_FOLLOWERS_ONLY_LABEL}
              </AppText>
            </Row>
          ) : null}
          <CouncilTierTag tier={hostTier} />
        </Row>
      </Stack>

      <Row gap="md" align="center" style={styles.hostRow}>
        <View style={styles.stack}>
          {preview.map((u) => (
            <View key={u.id} style={styles.stackItem}>
              <SarhAvatar uri={u.avatar ? resolveMediaUrl(u.avatar) : null} name={councilUserName(u)} size="sm" />
            </View>
          ))}
          {!preview.length ? (
            <View style={styles.stackItem}>
              <SarhAvatar
                uri={council.owner.avatar ? resolveMediaUrl(council.owner.avatar) : null}
                name={hostName}
                size="sm"
              />
            </View>
          ) : null}
        </View>

        <Stack gap="xs" style={styles.hostText}>
          <Row gap="sm" align="center">
            <SarhAvatar
              uri={council.owner.avatar ? resolveMediaUrl(council.owner.avatar) : null}
              name={hostName}
              size="sm"
            />
            <AppText variant="label" color="textPrimary" numberOfLines={1} style={styles.hostText}>
              {hostName}
            </AppText>
          </Row>
          <AppText
            variant="caption"
            color="textMuted"
            numberOfLines={1}
            style={styles.handle}
            accessibilityLabel={councilListenersLabel(council.listenerCount)}
          >
            {councilHandle(council.owner.username)}
            {council.speakersCount > 0
              ? ` · ${formatCouncilCount(council.speakersCount)} على المسرح`
              : ''}
          </AppText>
        </Stack>
      </Row>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      minHeight: 168,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      gap: spacing.lg,
      borderRadius: radius.xl,
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      justifyContent: 'space-between',
      overflow: 'hidden',
    },
    body: { flexGrow: 1 },
    title: { fontWeight: '700', letterSpacing: 0.2 },
    meta: { marginTop: spacing.xs },
    livePill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: 'rgba(239, 68, 68, 0.14)',
    },
    liveText: { color: colors.liveRed ?? colors.success, fontWeight: '700' },
    pressed: { opacity: 0.88 },
    goldCard: {
      borderWidth: 1,
      backgroundColor: 'rgba(201, 162, 39, 0.07)',
      overflow: 'hidden',
    },
    goldRule: {
      position: 'absolute',
      top: 0,
      left: spacing.lg,
      right: spacing.lg,
      height: 2,
      borderBottomLeftRadius: 2,
      borderBottomRightRadius: 2,
      backgroundColor: colors.tierGold,
    },
    blueCard: {
      borderColor: 'rgba(29, 155, 240, 0.45)',
      backgroundColor: 'rgba(29, 155, 240, 0.05)',
    },
    liveDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.liveRed ?? colors.success },
    hostRow: {
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSoft,
    },
    hostText: { flex: 1, minWidth: 0 },
    handle: { writingDirection: 'ltr', alignSelf: 'flex-start' },
    /**
     * Overlap is symmetric (−AVATAR_OVERLAP/2 on both sides, padded back on the stack) so the
     * stack's box always matches what is painted in LTR and RTL and never runs into the label.
     */
    stack: { flexDirection: 'row', paddingHorizontal: AVATAR_OVERLAP / 2, marginEnd: spacing.xs },
    stackItem: {
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.bgElevated,
      marginHorizontal: -AVATAR_OVERLAP / 2,
    },
  });
}
