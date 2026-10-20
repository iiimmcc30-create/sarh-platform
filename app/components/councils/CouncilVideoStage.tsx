import { StyleSheet, View } from 'react-native';
import { LiveKitVideoView } from '@/components/live/LiveKitVideoView';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText } from '@/design-system/components';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { CouncilVideoTrack } from '@/hooks/useCouncilAudio';
import { councilUserName, type CouncilParticipant } from '@/services/councils';

type Props = {
  tracks: CouncilVideoTrack[];
  participants: CouncilParticipant[];
};

/**
 * «المجلس الذهبي»: the host's (or an approved speaker's) camera, shown above the
 * participants only while a camera is on stage. Capped to the first two cameras so the
 * stage stays light; the server's resolution profile bounds each stream.
 */
export function CouncilVideoStage({ tracks, participants }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  if (tracks.length === 0) return null;
  const shown = tracks.slice(0, 2);
  return (
    <View style={styles.wrap} testID="council-video-stage">
      {shown.map((t) => {
        const who = participants.find((p) => p.userId === t.identity);
        return (
          <View key={t.identity} style={[styles.tile, shown.length > 1 && styles.half]}>
            <LiveKitVideoView track={t.track} style={styles.video} mirror={t.isLocal} />
            {who ? (
              <View style={styles.name}>
                <AppText variant="micro" color="textPrimary" numberOfLines={1}>
                  {councilUserName(who.user)}
                </AppText>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { flexDirection: 'row', gap: spacing.sm },
    tile: {
      flex: 1,
      aspectRatio: 16 / 9,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    half: { aspectRatio: 1 },
    video: { flex: 1 },
    name: {
      position: 'absolute',
      bottom: spacing.xs,
      start: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: colors.bgElevated,
    },
  });
}
