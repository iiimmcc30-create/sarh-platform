import { memo, useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText, SarhAvatar } from '@/design-system/components';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { subscriberTierOf, tierColorKeys } from '@/lib/subscriberTier';
import { shouldShowVerifiedBadge } from '@/lib/verifiedBadge';
import { resolveMediaUrl } from '@/services/media';
import { councilParticipantTag, councilUserName, type CouncilParticipant } from '@/services/councils';

/** Seat avatar — sized so four seats fill a phone row (≈ 83pt each at 390pt wide). */
const AVATAR = 64;
/** Subscriber tier ring: thin solid line hugging the avatar (inside the speaking ring). */
const TIER_RING = AVATAR + 4;
const SEAT_BADGE = 12;

type Props = {
  /** Any participant (stage or listener); every circle has the same size. */
  speaker: CouncilParticipant | null;
  speaking: boolean;
  isMe: boolean;
  /** Listener with a pending «طلب التحدث» (shown to the host / moderators). */
  handRaised?: boolean;
  onPress?: (speaker: CouncilParticipant) => void;
};

/**
 * One circle in the X Spaces style grid: avatar, a soft speaking ring, a quiet mic
 * state for people on stage, and a small role tag («راعي المجلس» / «مشرف» / «متحدث»)
 * under the name. Listeners get no tag.
 */
function SpeakerSeatBase({ speaker, speaking, isMe, handRaised = false, onPress }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const [ring] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  // Muted (by me or a moderator) never animates, whatever the audio level says.
  const active = Boolean(speaker && speaking && !speaker.micMuted && !speaker.mutedByModerator);

  useEffect(() => {
    Animated.timing(ring, {
      toValue: active ? 1 : 0,
      duration: active ? 160 : 420,
      useNativeDriver: true,
    }).start();
  }, [active, ring]);

  // Speaking mic: gentle pulse while the speaker is talking, stopped otherwise.
  useEffect(() => {
    if (!active) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 340, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 340, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  if (!speaker) {
    return (
      <View style={styles.seat} accessibilityLabel="مقعد فارغ">
        <View style={styles.emptyCircle}>
          <AppIcon name="mic" size={16} color={colors.textSubtle} />
        </View>
        <AppText variant="micro" color="textMuted" align="center" numberOfLines={1}>
          {' '}
        </AppText>
      </View>
    );
  }

  const name = councilUserName(speaker.user);
  // Listeners have no mic at all — only people on stage show the muted badge.
  const muted = speaker.onStage && (speaker.micMuted || speaker.mutedByModerator);
  const tag = councilParticipantTag(speaker);
  const tier = subscriberTierOf(speaker.user);
  const verified = shouldShowVerifiedBadge(speaker.user.verified);
  return (
    <Pressable
      style={styles.seat}
      onPress={onPress ? () => onPress(speaker) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${name}${tag ? `، ${tag}` : ''}${muted ? '، الميكروفون مغلق' : ''}${handRaised ? '، رفع يده' : ''}`}
    >
      <View style={styles.avatarWrap}>
        <Animated.View pointerEvents="none" style={[styles.ring, { opacity: ring }]} />
        {tier ? (
          <View
            pointerEvents="none"
            testID={`council-tier-ring-${tier}`}
            style={[styles.tierRing, { borderColor: colors[tierColorKeys(tier).line] }, !speaker.online && styles.offline]}
          />
        ) : null}
        <View style={[styles.avatarClip, !speaker.online && styles.offline]}>
          <SarhAvatar
            uri={speaker.user.avatar ? resolveMediaUrl(speaker.user.avatar) : null}
            name={name}
            size="xl"
            style={styles.avatar}
          />
        </View>
        {active ? (
          <Animated.View
            pointerEvents="none"
            testID="council-speaking-mic"
            style={[
              styles.micBadge,
              styles.speakingBadge,
              {
                opacity: ring,
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }) }],
              },
            ]}
          >
            <Animated.View
              style={{ transform: [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) }] }}
            >
              <AppIcon name="mic" size={11} color={colors.onElectric} />
            </Animated.View>
          </Animated.View>
        ) : null}
        {muted ? (
          <View style={styles.micBadge}>
            <AppIcon name="mic-off" size={11} color={speaker.mutedByModerator ? colors.danger : colors.textSecondary} />
          </View>
        ) : null}
        {handRaised ? (
          <View style={styles.roleBadge} testID="council-hand-raised">
            <AppIcon name="hand-left-outline" size={11} color={colors.textPrimary} />
          </View>
        ) : null}
      </View>
      <View style={styles.nameRow}>
        <AppText
          variant="micro"
          color={isMe ? 'textPrimary' : 'textSecondary'}
          align="center"
          numberOfLines={1}
          style={styles.name}
        >
          {isMe ? 'أنت' : name}
        </AppText>
        {verified ? <VerificationBadge size={SEAT_BADGE} tier={speaker.user.verifiedTier} /> : null}
      </View>
      {tag ? (
        <View style={styles.tagRow} testID="council-role-tag">
          {speaker.onStage ? <AppIcon name="mic" size={9} color={colors.textMuted} /> : null}
          <AppText variant="micro" color="textMuted" numberOfLines={1} style={styles.tagText}>
            {tag}
          </AppText>
        </View>
      ) : (
        <View style={styles.tagSpacer} />
      )}
    </Pressable>
  );
}

export const SpeakerSeat = memo(SpeakerSeatBase);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    seat: { flex: 1, alignItems: 'center', gap: spacing.xs, minWidth: 0, paddingHorizontal: 2 },
    avatarWrap: { width: AVATAR + 8, height: AVATAR + 8, alignItems: 'center', justifyContent: 'center' },
    ring: {
      position: 'absolute',
      width: AVATAR + 8,
      height: AVATAR + 8,
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.electric,
    },
    tierRing: {
      position: 'absolute',
      width: TIER_RING,
      height: TIER_RING,
      borderRadius: radius.pill,
      borderWidth: 1.5,
    },
    avatarClip: { width: AVATAR, height: AVATAR, borderRadius: radius.pill, overflow: 'hidden' },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      maxWidth: '100%',
      minWidth: 0,
    },
    name: { flexShrink: 1 },
    /** Role tag line under the name; listeners keep the same height (grid rows align). */
    tagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      maxWidth: '100%',
      minHeight: 14,
      marginTop: -2,
    },
    tagText: { flexShrink: 1 },
    tagSpacer: { minHeight: 14, marginTop: -2 },
    avatar: { width: AVATAR, height: AVATAR },
    offline: { opacity: 0.45 },
    emptyCircle: {
      width: AVATAR,
      height: AVATAR,
      margin: 4,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderMid,
      backgroundColor: colors.bgSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    micBadge: {
      position: 'absolute',
      bottom: 2,
      end: 2,
      width: 20,
      height: 20,
      borderRadius: radius.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderMid,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /** Accent fill (white in dark, black in light) with a page-coloured cut-out edge. */
    speakingBadge: {
      backgroundColor: colors.electric,
      borderWidth: 1.5,
      borderColor: colors.bgPrimary,
    },
    roleBadge: {
      position: 'absolute',
      top: 2,
      end: 2,
      width: 20,
      height: 20,
      borderRadius: radius.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderMid,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
