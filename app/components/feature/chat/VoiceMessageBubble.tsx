/**
 * Voice note bubble content: play/pause, progress bar and duration.
 * Uses expo-audio (native + web). Duration falls back to the server
 * metadata until the player has loaded the file.
 */
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/design-system/components';
import { formatMediaDuration } from '@/lib/chatMessageModel';
import type { ChatBubbleColors } from '@/lib/chatBubbleTheme';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

/** 0..1 playback progress (pure; exported for tests). */
export function voiceProgress(currentSec: number, durationSec: number): number {
  if (!Number.isFinite(currentSec) || !Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return Math.min(1, Math.max(0, currentSec / durationSec));
}

type Props = {
  uri: string;
  durationMs?: number;
  isMe: boolean;
  palette: ChatBubbleColors;
};

export function VoiceMessageBubble({ uri, durationMs, isMe, palette }: Props) {
  const player = useAudioPlayer(uri, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      void player.seekTo(0);
    }
  }, [player, status.didJustFinish]);

  const loadedSec = status.duration > 0 ? status.duration : (durationMs ?? 0) / 1000;
  const progress = voiceProgress(status.currentTime, loadedSec);
  const playing = status.playing;
  const shownMs = playing || status.currentTime > 0 ? status.currentTime * 1000 : loadedSec * 1000;
  const textColor = isMe ? palette.sentText : palette.receivedText;
  const metaColor = isMe ? palette.sentMeta : palette.receivedMeta;

  return (
    <View style={styles.row} accessibilityLabel="رسالة صوتية">
      <Pressable
        onPress={() => (playing ? player.pause() : player.play())}
        style={[styles.playBtn, { backgroundColor: palette.accent }]}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'إيقاف مؤقت' : 'تشغيل الرسالة الصوتية'}
        hitSlop={6}
      >
        {status.isBuffering && !status.isLoaded ? (
          <ActivityIndicator size="small" color={palette.onAccent} />
        ) : (
          <AppIcon name={playing ? 'pause' : 'play'} size={16} color={palette.onAccent} />
        )}
      </Pressable>
      <View style={styles.body}>
        <View style={[styles.track, { backgroundColor: palette.track }]}>
          <View
            style={[
              styles.fill,
              { width: `${Math.round(progress * 100)}%`, backgroundColor: palette.accent },
            ]}
          />
        </View>
        <AppText variant="caption" style={{ color: metaColor }}>
          {formatMediaDuration(shownMs)}
        </AppText>
      </View>
      <AppIcon name="mic" size={14} color={textColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 180,
    paddingVertical: 2,
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 4 },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: { height: 4, borderRadius: 2 },
});
