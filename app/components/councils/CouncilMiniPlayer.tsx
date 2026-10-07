// «المجالس» mini player: shown while listening and browsing (docked above the tab bar
// and at the bottom of the councils list). Tap → back to the room.
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { CouncilMicButton } from '@/components/councils/CouncilMicButton';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useOptionalCouncilSession } from '@/contexts/CouncilSessionContext';
import { AppText, SarhAvatar } from '@/design-system/components';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { COUNCIL_MINI_PLAYER_GAP, COUNCIL_MINI_PLAYER_HEIGHT } from '@/lib/councilSession';
import { getRtlRow } from '@/lib/rtl';
import { safePush } from '@/lib/safeNavigate';
import { resolveMediaUrl } from '@/services/media';
import { councilListenersLabel, councilUserName, type CouncilSpeaker } from '@/services/councils';

const MAX_AVATARS = 3;

/** Speaking members first, then the rest of the stage. */
export function miniPlayerAvatars(speakers: CouncilSpeaker[], speaking: Set<string>): CouncilSpeaker[] {
  const talking = speakers.filter((s) => speaking.has(s.userId));
  const rest = speakers.filter((s) => !speaking.has(s.userId));
  return [...talking, ...rest].slice(0, MAX_AVATARS);
}

export function CouncilMiniPlayer({ style }: { style?: StyleProp<ViewStyle> }) {
  const session = useOptionalCouncilSession();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));

  if (!session?.miniPlayerVisible || !session.state || !session.councilId) return null;

  const { state, speakingUserIds, stageSpeakers, councilId } = session;
  const me = state.me;
  const avatars = miniPlayerAvatars(stageSpeakers, speakingUserIds);
  const talking = stageSpeakers.find((s) => speakingUserIds.has(s.userId));
  const subtitle = talking ? `يتحدث الآن: ${councilUserName(talking.user)}` : councilListenersLabel(state.listenerCount);

  return (
    <View style={[styles.wrap, style]} pointerEvents="box-none" testID="council-mini-player">
      <Pressable
        onPress={() => safePush({ pathname: '/councils/[id]', params: { id: councilId } }, undefined, router)}
        accessibilityRole="button"
        accessibilityLabel={`العودة إلى المجلس ${state.council.name}`}
        style={({ pressed }) => [styles.card, getRtlRow(), pressed && styles.pressed]}
      >
        <View style={[styles.avatars, getRtlRow()]}>
          {avatars.map((s) => (
            <View key={s.userId} style={styles.avatarRing}>
              <SarhAvatar
                uri={s.user.avatar ? resolveMediaUrl(s.user.avatar) : null}
                name={councilUserName(s.user)}
                size="xs"
              />
            </View>
          ))}
        </View>
        <View style={styles.text}>
          <AppText variant="label" color="textPrimary" numberOfLines={1}>
            {state.council.name}
          </AppText>
          <View style={[styles.subRow, getRtlRow()]}>
            <View style={styles.liveDot} />
            <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.subText}>
              {subtitle}
            </AppText>
          </View>
        </View>
        {me.onStage ? (
          <CouncilMicButton
            size={40}
            muted={me.micMuted}
            mutedByModerator={me.mutedByModerator}
            loading={session.busy === 'mic'}
            onPress={() => void session.toggleMic()}
          />
        ) : null}
        <Pressable
          testID="council-mini-leave"
          onPress={() => void session.leave()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="مغادرة المجلس"
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <AppIcon name="close" size={18} color={colors.textSecondary} />
        </Pressable>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { paddingHorizontal: spacing.sm, paddingBottom: COUNCIL_MINI_PLAYER_GAP },
    card: {
      height: COUNCIL_MINI_PLAYER_HEIGHT,
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderMid,
    },
    avatars: { alignItems: 'center' },
    avatarRing: {
      marginHorizontal: -3,
      borderRadius: radius.pill,
      borderWidth: 2,
      borderColor: colors.bgElevated,
    },
    text: { flex: 1, minWidth: 0, gap: 2 },
    subRow: { alignItems: 'center', gap: spacing.xs },
    subText: { flexShrink: 1 },
    liveDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.success },
    close: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.7 },
  });
}
