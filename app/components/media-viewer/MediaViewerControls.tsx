import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import type { MediaViewerPlaybackState } from '@/lib/useMediaViewerPlayback';
import Slider from '@react-native-community/slider';
import { Pressable, StyleSheet, View } from 'react-native';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type Props = {
  playback: MediaViewerPlaybackState;
  onTogglePlay: () => void;
  onReplay: () => void;
  onSeek: (seconds: number) => void;
  visible: boolean;
};

export function MediaViewerControls({
  playback,
  onTogglePlay,
  onReplay,
  onSeek,
  visible,
}: Props) {
  if (!visible) return null;

  const showReplay = playback.phase === 'ended';

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar} onStartShouldSetResponder={() => true}>
        {showReplay ? (
          <Pressable
            onPress={onReplay}
            style={styles.replayBtn}
            accessibilityRole="button"
            accessibilityLabel="إعادة التشغيل"
          >
            <AppIcon name="refresh-cw" size={22} color="#fff" />
            <AppText style={styles.replayText}>إعادة التشغيل</AppText>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={onTogglePlay}
              style={styles.playBtn}
              accessibilityRole="button"
              accessibilityLabel={playback.isPlaying ? 'إيقاف' : 'تشغيل'}
            >
              <AppIcon
                name={playback.isPlaying ? 'pause' : 'play'}
                size={22}
                color="#fff"
                variant="sr"
              />
            </Pressable>
            <AppText style={styles.time}>{formatTime(playback.currentTime)}</AppText>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={1}
              value={playback.progress}
              onSlidingComplete={(v) => {
                if (playback.duration > 0) onSeek(v * playback.duration);
              }}
              minimumTrackTintColor="#fff"
              maximumTrackTintColor="rgba(255,255,255,0.35)"
              thumbTintColor="#fff"
            />
            <AppText style={styles.time}>{formatTime(playback.duration)}</AppText>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    zIndex: 95,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  playBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: {
    color: '#fff',
    fontSize: 12,
    minWidth: 36,
    textAlign: 'center',
  },
  slider: {
    flex: 1,
    height: 28,
  },
  replayBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  replayText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
