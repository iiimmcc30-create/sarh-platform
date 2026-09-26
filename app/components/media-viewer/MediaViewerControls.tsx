import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { formatViewerRemainingTime } from '@/lib/mediaViewerVideoLayout';
import type { MediaViewerPlaybackState } from '@/lib/useMediaViewerPlayback';
import { getRtlRow } from '@/lib/rtl';
import { Pressable, StyleSheet, View } from 'react-native';

type Props = {
  playback: MediaViewerPlaybackState;
  onTogglePlay: () => void;
  onReplay: () => void;
  onSeek: (seconds: number) => void;
  visible: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onToggleChrome: () => void;
};

export function MediaViewerControls({
  playback,
  onTogglePlay,
  onReplay,
  visible,
  muted,
  onToggleMute,
  onToggleChrome,
}: Props) {
  if (!visible) return null;

  const showReplay = playback.phase === 'ended';
  const remaining = formatViewerRemainingTime(playback.duration, playback.currentTime);
  const progress =
    playback.duration > 0
      ? Math.min(1, Math.max(0, playback.currentTime / playback.duration))
      : 0;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.progressTrack} pointerEvents="none">
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={[styles.bar, getRtlRow()]} onStartShouldSetResponder={() => true}>
        {showReplay ? (
          <Pressable
            onPress={onReplay}
            style={styles.replayBtn}
            accessibilityRole="button"
            accessibilityLabel="إعادة التشغيل"
          >
            <AppIcon name="refresh-cw" size={20} color="#fff" />
            <AppText style={styles.replayText}>إعادة التشغيل</AppText>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={onTogglePlay}
              style={styles.iconBtn}
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
            <AppText style={styles.remaining}>{remaining}</AppText>
            <AppText style={styles.speed}>1X</AppText>
            <View style={styles.spacer} />
            <Pressable
              onPress={onToggleMute}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
            >
              <AppIcon
                name={muted ? 'volume-mute' : 'volume-high'}
                size={20}
                color="#fff"
                variant="sr"
              />
            </Pressable>
            <Pressable
              onPress={onToggleChrome}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="ملء الشاشة"
            >
              <AppIcon name="expand" size={20} color="#fff" variant="sr" />
            </Pressable>
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
  },
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 2,
  },
  progressFill: {
    height: 2,
    backgroundColor: '#fff',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  iconBtn: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remaining: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    minWidth: 48,
  },
  speed: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    minWidth: 28,
  },
  spacer: {
    flex: 1,
  },
  replayBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  replayText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
