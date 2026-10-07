import { StyleSheet, View } from 'react-native';
import { spacing } from '@/constants/theme';
import { councilSeatRows, type CouncilSpeaker } from '@/services/councils';
import { SpeakerSeat } from './SpeakerSeat';

type Props = {
  speakers: CouncilSpeaker[];
  speakingUserIds: Set<string>;
  myUserId: string | undefined;
  onSpeakerPress?: (speaker: CouncilSpeaker) => void;
};

/** Fixed 4 × 3 stage — 12 seats, empty seats keep their place. */
export function SpeakerGrid({ speakers, speakingUserIds, myUserId, onSpeakerPress }: Props) {
  const rows = councilSeatRows(speakers);
  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((s, c) => (
            <SpeakerSeat
              key={s?.userId ?? `empty-${r}-${c}`}
              speaker={s}
              speaking={Boolean(s && speakingUserIds.has(s.userId))}
              isMe={Boolean(s && s.userId === myUserId)}
              onPress={onSpeakerPress}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.sm },
});
