import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { getAgoraModule, isExpoGoEnvironment, VideoSourceType } from '@/lib/agora';
import { colors, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

interface AgoraVideoViewProps {
  canvas: { uid?: number; sourceType?: number };
  style?: StyleProp<ViewStyle>;
  /** Local camera preview — always uses uid 0 */
  local?: boolean;
}

export function AgoraVideoView({ canvas, style, local }: AgoraVideoViewProps) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  if (isExpoGoEnvironment()) {
    return (
      <View style={[styles.placeholder, style]}>
        <Text style={styles.placeholderText}>
          البث المباشر غير متاح في Expo Go. استخدم development build لتجربة Agora.
        </Text>
      </View>
    );
  }

  const agora = getAgoraModule();

  if (!agora) {
    return (
      <View style={[styles.placeholder, style]}>
        <Text style={styles.placeholderText}>
          البث المباشر غير متاح في Expo Go. استخدم development build لتجربة Agora.
        </Text>
      </View>
    );
  }

  const { RtcSurfaceView } = agora;
  const viewCanvas = local
    ? { uid: 0, sourceType: VideoSourceType.VideoSourceCamera }
    : canvas;

  return <RtcSurfaceView canvas={viewCanvas} style={style} />;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSurface,
    padding: 24,
  },
  placeholderText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
}
