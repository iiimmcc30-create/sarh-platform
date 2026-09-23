import { AppIcon } from '@/components/ui/FlaticonIcon';
import Slider from '@react-native-community/slider';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  STORY_MAX_DURATION_SEC,
} from '@/constants/stories';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import {
  storyClipEndSec,
  storyTrimStartMax,
  trimStoryVideoClip,
} from '@/lib/storyMedia';
import { getExpoVideoModule } from '@/lib/expoVideo';
import { StoryVideoPlayer } from './StoryVideoPlayer';

type StoryVideoTrimmerProps = {
  visible: boolean;
  uri: string;
  durationSec: number;
  maxDurationSec?: number;
  minDurationSec?: number;
  title?: string;
  onCancel: () => void;
  onConfirm: (result: { uri: string; durationSec: number }) => void;
};

function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function TrimmerPreview({
  uri,
  startSec,
  endSec,
}: {
  uri: string;
  startSec: number;
  endSec: number;
}) {
  const expoVideo = getExpoVideoModule();

  if (!expoVideo) {
    return <StoryVideoPlayer uri={uri} style={StyleSheet.absoluteFill} muted loop />;
  }

  const { useVideoPlayer, VideoView } = expoVideo;
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = true;
    p.currentTime = startSec;
    p.play();
  });

  useEffect(() => {
    player.currentTime = startSec;
    if (!player.playing) player.play();
  }, [player, startSec]);

  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (typeof currentTime === 'number' && currentTime >= endSec - 0.05) {
        player.currentTime = startSec;
        player.play();
      }
    });
    return () => sub.remove();
  }, [player, startSec, endSec]);

  return (
    <VideoView player={player} style={StyleSheet.absoluteFillObject} contentFit="cover" />
  );
}

export function StoryVideoTrimmer({
  visible,
  uri,
  durationSec,
  maxDurationSec = STORY_MAX_DURATION_SEC,
  minDurationSec = 1,
  title = 'اختر مقطع الفيديو',
  onCancel,
  onConfirm,
}: StoryVideoTrimmerProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [startSec, setStartSec] = useState(0);
  const [busy, setBusy] = useState(false);

  const maxStart = storyTrimStartMax(durationSec, minDurationSec);
  const endSec = storyClipEndSec(startSec, durationSec, maxDurationSec, minDurationSec);
  const clipDuration = Math.round(endSec - startSec);

  useEffect(() => {
    if (visible) setStartSec(0);
  }, [visible, uri]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const trimmedUri = await trimStoryVideoClip(uri, startSec, endSec);
      if (!trimmedUri) {
        throw new Error('تعذّر قص الفيديو. أعد بناء التطبيق ثم حاول مجدداً.');
      }
      onConfirm({ uri: trimmedUri, durationSec: clipDuration });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذّر قص الفيديو';
      Alert.alert('قص الفيديو', message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} disabled={busy} hitSlop={8} style={styles.iconBtn}>
            <AppIcon name="close" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.previewBox}>
          <TrimmerPreview uri={uri} startSec={startSec} endSec={endSec} />
        </View>

        <View style={styles.panel}>
          <Text style={styles.hint}>
            اسحب لتحديد بداية المقطع — الحد الأقصى {maxDurationSec} ثانية
          </Text>

          <View style={styles.rangeRow}>
            <Text style={styles.rangeLabel}>{formatClock(startSec)}</Text>
            <Text style={styles.rangeMid}>
              {clipDuration} ث / {formatClock(durationSec)}
            </Text>
            <Text style={styles.rangeLabel}>{formatClock(endSec)}</Text>
          </View>

          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={maxStart}
            step={0.5}
            value={startSec}
            onValueChange={setStartSec}
            minimumTrackTintColor={colors.electricBright}
            maximumTrackTintColor={colors.borderSoft}
            thumbTintColor={colors.electricBright}
            disabled={busy}
          />

          <View style={styles.timelineTrack}>
            <View
              style={[
                styles.timelineSelection,
                {
                  left: `${durationSec > 0 ? (startSec / durationSec) * 100 : 0}%`,
                  width: `${durationSec > 0 ? (clipDuration / durationSec) * 100 : 100}%`,
                },
              ]}
            />
          </View>

          <Pressable
            style={[styles.confirmBtn, busy && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmText}>تأكيد المقطع ({clipDuration} ث)</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.screenRoot },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    iconBtn: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { ...typography.h3, color: colors.textPrimary },
    previewBox: {
      flex: 1,
      marginHorizontal: spacing.lg,
      borderRadius: radius.xxl,
      overflow: 'hidden',
      backgroundColor: colors.bgSurface,
    },
    panel: {
      padding: spacing.lg,
      gap: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    hint: {
      ...typography.caption,
      color: colors.textMuted,
      textAlign: 'center',
    },
    rangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rangeLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
    rangeMid: { ...typography.bodyStrong, color: colors.textPrimary },
    slider: { width: '100%', height: 40 },
    timelineTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.bgSurface,
      overflow: 'hidden',
    },
    timelineSelection: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      backgroundColor: colors.electricBright,
      borderRadius: 3,
    },
    confirmBtn: {
      backgroundColor: colors.electricBright,
      borderRadius: radius.pill,
      paddingVertical: 14,
      alignItems: 'center',
    },
    confirmBtnDisabled: { opacity: 0.7 },
    confirmText: { ...typography.bodyStrong, color: '#fff' },
  });
}
