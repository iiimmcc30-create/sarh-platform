import { memo, useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText, SarhAvatar } from '@/design-system/components';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { resolveMediaUrl } from '@/services/media';
import { councilUserName, type CouncilSpeaker } from '@/services/councils';

const AVATAR = 56;

type Props = {
  speaker: CouncilSpeaker | null;
  speaking: boolean;
  isMe: boolean;
  onPress?: (speaker: CouncilSpeaker) => void;
};

/** One seat in the 4 × 3 grid: avatar circle, a soft speaking ring and a quiet mic state. */
function SpeakerSeatBase({ speaker, speaking, isMe, onPress }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const [ring] = useState(() => new Animated.Value(0));
  const active = Boolean(speaker && speaking && !speaker.micMuted);

  useEffect(() => {
    Animated.timing(ring, {
      toValue: active ? 1 : 0,
      duration: active ? 160 : 420,
      useNativeDriver: true,
    }).start();
  }, [active, ring]);

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
  const muted = speaker.micMuted || speaker.mutedByModerator;
  return (
    <Pressable
      style={styles.seat}
      onPress={onPress ? () => onPress(speaker) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${name}${muted ? '، الميكروفون مغلق' : ''}`}
    >
      <View style={styles.avatarWrap}>
        <Animated.View pointerEvents="none" style={[styles.ring, { opacity: ring }]} />
        <View style={[styles.avatarClip, !speaker.online && styles.offline]}>
          <SarhAvatar
            uri={speaker.user.avatar ? resolveMediaUrl(speaker.user.avatar) : null}
            name={name}
            size="xl"
            style={styles.avatar}
          />
        </View>
        {muted ? (
          <View style={styles.micBadge}>
            <AppIcon name="mic-off" size={11} color={speaker.mutedByModerator ? colors.danger : colors.textSecondary} />
          </View>
        ) : null}
        {speaker.role === 'OWNER' || speaker.role === 'MODERATOR' ? (
          <View style={styles.roleBadge}>
            <AppIcon
              name={speaker.role === 'OWNER' ? 'shield-checkmark-outline' : 'shield-outline'}
              size={11}
              color={colors.electric}
            />
          </View>
        ) : null}
      </View>
      <AppText variant="micro" color={isMe ? 'textPrimary' : 'textSecondary'} align="center" numberOfLines={1}>
        {isMe ? 'أنت' : name}
      </AppText>
    </Pressable>
  );
}

export const SpeakerSeat = memo(SpeakerSeatBase);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    seat: { flex: 1, alignItems: 'center', gap: spacing.xs, minWidth: 0 },
    avatarWrap: { width: AVATAR + 8, height: AVATAR + 8, alignItems: 'center', justifyContent: 'center' },
    ring: {
      position: 'absolute',
      width: AVATAR + 8,
      height: AVATAR + 8,
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.electric,
    },
    avatarClip: { width: AVATAR, height: AVATAR, borderRadius: radius.pill, overflow: 'hidden' },
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
