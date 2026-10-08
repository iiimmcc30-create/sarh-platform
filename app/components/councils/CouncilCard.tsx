import { Pressable, StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText, SarhAvatar } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { CouncilTierTag } from './CouncilTierTag';
import { subscriberTierOf } from '@/lib/subscriberTier';
import { resolveMediaUrl } from '@/services/media';
import {
  councilListenersLabel,
  councilSpeakersLabel,
  councilUserName,
  type CouncilCard as CouncilCardData,
} from '@/services/councils';

type Props = { council: CouncilCardData; onPress: (c: CouncilCardData) => void };

/** How much neighbouring avatars in the speaker stack overlap. */
const AVATAR_OVERLAP = 10;

export function CouncilCard({ council, onPress }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const hostTier = subscriberTierOf(council.owner);
  return (
    <Pressable
      testID={hostTier === 'gold' ? 'council-card-gold' : undefined}
      onPress={() => onPress(council)}
      style={({ pressed }) => [
        styles.card,
        hostTier === 'gold' && { borderColor: colors.tierGold },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`مجلس ${council.name}`}
    >
      <Row gap="sm" align="center">
        <View style={styles.liveDot} />
        <AppText variant="caption" color="success">
          مباشر
        </AppText>
        {council.visibility === 'PRIVATE' ? (
          <Row gap="xs" align="center">
            <AppIcon name="lock-closed-outline" size={12} color={colors.textMuted} />
            <AppText variant="caption" color="textMuted">
              خاص
            </AppText>
          </Row>
        ) : null}
        <CouncilTierTag tier={hostTier} />
        <View style={{ flex: 1 }} />
        <AppText variant="caption" color="textMuted">
          {councilListenersLabel(council.listenerCount)}
        </AppText>
      </Row>
      <AppText variant="cardTitle" color="textPrimary" numberOfLines={2}>
        {council.name}
      </AppText>
      {council.description ? (
        <AppText variant="bodySmall" color="textSecondary" numberOfLines={2}>
          {council.description}
        </AppText>
      ) : null}
      <Row gap="sm" align="center">
        <View style={styles.stack}>
          {council.speakersPreview.slice(0, 4).map((u) => (
            <View key={u.id} style={styles.stackItem}>
              <SarhAvatar uri={u.avatar ? resolveMediaUrl(u.avatar) : null} name={councilUserName(u)} size="sm" />
            </View>
          ))}
        </View>
        <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
          {councilUserName(council.owner)} · {councilSpeakersLabel(council.speakersCount)}
        </AppText>
      </Row>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      padding: spacing.lg,
      gap: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    pressed: { opacity: 0.85 },
    liveDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.success },
    /**
     * Overlap is symmetric (−AVATAR_OVERLAP/2 on both sides, padded back on the stack) so the
     * stack's box always matches what is painted in LTR and RTL and never runs into the label.
     */
    stack: { flexDirection: 'row', paddingHorizontal: AVATAR_OVERLAP / 2, marginEnd: spacing.xs },
    stackItem: {
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.bgSurface,
      marginHorizontal: -AVATAR_OVERLAP / 2,
    },
  });
}
