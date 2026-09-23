/**
 * ListingVideoSection — independent optional video attachment for listing create.
 *
 * Rules:
 * - Never touches the image system / Gallery.
 * - Video is always optional.
 * - Never crops, never stretches — uses contentFit="contain".
 * - Works for 16:9, 9:16, 4:3, and any common aspect ratio.
 */
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from '@/components/ui/AppImage';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { LISTING_VIDEO_CONFIG } from '@/constants/listingVideoConfig';
import { StoryVideoTrimmer } from '@/components/feature/StoryVideoTrimmer';
import {
  listingVideoDurationFromPicker,
  listingVideoNeedsTrim,
} from '@/lib/listingLimits';
import {
  generateVideoThumbnail,
  listingVideoValidationMessage,
  type ListingVideoMeta,
  validateListingVideo,
} from '@/services/listingVideo';
import { getExpoVideoModule } from '@/lib/expoVideo';

export type ListingVideoState =
  | { status: 'idle' }
  | { status: 'picked'; meta: ListingVideoMeta }
  | { status: 'uploading'; meta: ListingVideoMeta; progress: number }
  | { status: 'ready'; meta: ListingVideoMeta; videoUrl: string; thumbnailUrl: string | null }
  | { status: 'failed'; meta: ListingVideoMeta; error: string };

type Props = {
  state: ListingVideoState;
  onChange: (next: ListingVideoState) => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  /** Compact media tile used on the create-listing first step. */
  variant?: 'default' | 'tile';
};

type LegacyFileSystem = {
  getInfoAsync: (uri: string) => Promise<{
    exists: boolean;
    size?: number;
  }>;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function ListingVideoSection({
  state,
  onChange,
  style,
  disabled = false,
  variant = 'default',
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [trimDraft, setTrimDraft] = useState<{
    uri: string;
    durationSec: number;
    width: number;
    height: number;
    fileSizeBytes: number;
  } | null>(null);

  const applyPickedVideo = useCallback(
    async (input: {
      localUri: string;
      durationSecs: number;
      width: number;
      height: number;
      fileSizeBytes: number;
    }) => {
      const validationErr = validateListingVideo(input.durationSecs, input.fileSizeBytes);
      if (validationErr) {
        Alert.alert('فيديو غير صالح', listingVideoValidationMessage(validationErr));
        return;
      }

      const thumbnailUri = await generateVideoThumbnail(input.localUri);
      const meta: ListingVideoMeta = {
        localUri: input.localUri,
        thumbnailUri,
        durationSecs: clamp(input.durationSecs, 0, LISTING_VIDEO_CONFIG.MAX_DURATION_S),
        width: input.width,
        height: input.height,
        fileSizeBytes: input.fileSizeBytes,
      };
      onChange({ status: 'picked', meta });
    },
    [onChange],
  );

  const pickVideo = useCallback(async () => {
    if (disabled) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('إذن مطلوب', 'يرجى السماح بالوصول إلى معرض الوسائط لإضافة فيديو.');
      return;
    }

    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsMultipleSelection: false,
      });
    } catch {
      Alert.alert('خطأ', 'تعذّر فتح معرض الوسائط.');
      return;
    }

    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    const localUri = asset.uri;
    const durationSecs = listingVideoDurationFromPicker(asset.duration);
    const fileSizeBytes = asset.fileSize ?? 0;
    const width = asset.width ?? 0;
    const height = asset.height ?? 0;

    const sizeErr = validateListingVideo(null, fileSizeBytes);
    if (sizeErr) {
      Alert.alert('فيديو غير صالح', listingVideoValidationMessage(sizeErr));
      return;
    }

    if (listingVideoNeedsTrim(durationSecs, LISTING_VIDEO_CONFIG.MAX_DURATION_S)) {
      setTrimDraft({
        uri: localUri,
        durationSec: durationSecs,
        width,
        height,
        fileSizeBytes,
      });
      return;
    }

    await applyPickedVideo({
      localUri,
      durationSecs,
      width,
      height,
      fileSizeBytes,
    });
  }, [applyPickedVideo, disabled]);

  const removeVideo = useCallback(() => {
    Alert.alert('حذف الفيديو', 'هل تريد إزالة الفيديو من الإعلان؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: () => onChange({ status: 'idle' }),
      },
    ]);
  }, [onChange]);

  const hasMeta =
    state.status === 'picked' ||
    state.status === 'uploading' ||
    state.status === 'ready' ||
    state.status === 'failed';

  const trimmer = (
    <StoryVideoTrimmer
      visible={trimDraft != null}
      uri={trimDraft?.uri ?? ''}
      durationSec={trimDraft?.durationSec ?? 0}
      maxDurationSec={LISTING_VIDEO_CONFIG.MAX_DURATION_S}
      minDurationSec={1}
      title="قص فيديو الإعلان"
      onCancel={() => setTrimDraft(null)}
      onConfirm={async (result) => {
        const draft = trimDraft;
        setTrimDraft(null);
        if (!draft) return;
        let fileSizeBytes = draft.fileSizeBytes;
        try {
          const FileSystem = require('expo-file-system/legacy') as LegacyFileSystem;
          const info = await FileSystem.getInfoAsync(result.uri);
          if (info.exists && typeof info.size === 'number') {
            fileSizeBytes = info.size;
          }
        } catch {
          // keep original size estimate
        }
        await applyPickedVideo({
          localUri: result.uri,
          durationSecs: result.durationSec,
          width: draft.width,
          height: draft.height,
          fileSizeBytes,
        });
      }}
    />
  );

  if (state.status === 'idle') {
    if (variant === 'tile') {
      return (
        <View style={[{ flex: 1 }, style]}>
          <Pressable
            onPress={pickVideo}
            disabled={disabled}
            style={({ pressed }) => [styles.tileBtn, pressed && { opacity: 0.82 }]}
            accessibilityRole="button"
            accessibilityLabel="إضافة فيديو للعرض"
          >
            <AppIcon name="videocam" size={22} color={colors.electricBright} />
            <Text style={styles.tileTitle}>فيديو</Text>
            <Text style={styles.tileSub}>أضف فيديو للعرض</Text>
          </Pressable>
          {trimmer}
        </View>
      );
    }
    return (
      <View style={[styles.addBtn, style]}>
        <Pressable
          onPress={pickVideo}
          disabled={disabled}
          style={({ pressed }) => [styles.addBtnInner, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="إضافة فيديو للإعلان"
        >
          <AppIcon name="videocam" size={22} color={colors.textMuted} />
          <Text style={styles.addBtnText}>إضافة فيديو</Text>
          <Text style={styles.addBtnSub}>اختياري · حتى {LISTING_VIDEO_CONFIG.MAX_DURATION_S} ثانية · يمكن قص الأطول</Text>
        </Pressable>
        {trimmer}
      </View>
    );
  }

  if (!hasMeta) return null;

  const meta = (state as { meta: ListingVideoMeta }).meta;
  const uploadProgress =
    state.status === 'uploading' ? state.progress : 0;
  const isUploading = state.status === 'uploading';
  const isReady = state.status === 'ready';
  const isFailed = state.status === 'failed';

  const previewUri = meta.thumbnailUri ?? meta.localUri;

  // Compute preview height preserving aspect ratio (fits into card width)
  const aspectRatio =
    meta.width > 0 && meta.height > 0 ? meta.width / meta.height : 9 / 16;

  return (
    <View style={[styles.card, style]}>
      {/* Video preview */}
      <VideoPreview
        localUri={meta.localUri}
        thumbnailUri={meta.thumbnailUri}
        aspectRatio={aspectRatio}
        disabled={isUploading}
      />

      {/* Upload overlay */}
      {isUploading && (
        <View style={styles.uploadOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.uploadOverlayText}>
            جارٍ الرفع... {Math.round(uploadProgress)}%
          </Text>
          {uploadProgress > 0 && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
            </View>
          )}
        </View>
      )}

      {/* Status bar */}
      <View style={styles.metaRow}>
        <View style={styles.metaInfo}>
          <AppIcon
            name={isReady ? 'checkmark-circle' : isFailed ? 'alert-circle' : 'videocam-outline'}
            size={16}
            color={
              isReady ? colors.electricBright : isFailed ? colors.rose : colors.textMuted
            }
          />
          <Text style={[styles.metaText, isFailed && { color: colors.rose }]}>
            {isReady
              ? 'تم رفع الفيديو'
              : isFailed
                ? 'فشل الرفع'
                : isUploading
                  ? `جارٍ الرفع ${Math.round(uploadProgress)}%`
                  : `${Math.round(meta.durationSecs)}ث · ${meta.width > meta.height ? '📺 أفقي' : '📱 عمودي'}`}
          </Text>
        </View>

        <View style={styles.metaActions}>
          {isFailed && (
            <Pressable
              onPress={pickVideo}
              style={styles.actionBtn}
              hitSlop={8}
              accessibilityLabel="اختيار فيديو آخر"
            >
              <AppIcon name="refresh-outline" size={18} color={colors.textMuted} />
            </Pressable>
          )}
          {!isUploading && (
            <Pressable
              onPress={isReady || isFailed ? removeVideo : pickVideo}
              style={styles.actionBtn}
              hitSlop={8}
              accessibilityLabel={isReady ? 'حذف الفيديو' : 'استبدال الفيديو'}
            >
              <AppIcon
                name={isReady ? 'trash-outline' : 'refresh-outline'}
                size={18}
                color={isReady ? colors.rose : colors.textMuted}
              />
            </Pressable>
          )}
        </View>
      </View>
      {trimmer}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Internal: Video preview card — uses expo-video if available, fallback image
// ---------------------------------------------------------------------------
type VideoPreviewProps = {
  localUri: string;
  thumbnailUri: string | null;
  aspectRatio: number;
  disabled?: boolean;
};

function VideoPreview({ localUri, thumbnailUri, aspectRatio, disabled }: VideoPreviewProps) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const [playing, setPlaying] = useState(false);
  const [nativeAvailable] = useState(() => getExpoVideoModule() != null);

  const previewUri = thumbnailUri ?? localUri;

  const containerStyle = useMemo(
    () => [styles.previewContainer, { aspectRatio }],
    [styles.previewContainer, aspectRatio],
  );

  if (!nativeAvailable || Platform.OS === 'web' || !playing) {
    return (
      <View style={containerStyle}>
        <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFill} contentFit="contain" />
        {!disabled && (
          <Pressable
            style={styles.playBtn}
            onPress={() => setPlaying(true)}
            hitSlop={12}
            accessibilityLabel="تشغيل الفيديو"
          >
            <View style={styles.playBtnCircle}>
              <AppIcon name="play" size={24} color="#fff" />
            </View>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <NativeVideoPlayer
      uri={localUri}
      containerStyle={containerStyle}
      onClose={() => setPlaying(false)}
    />
  );
}

type NativeVideoPlayerProps = {
  uri: string;
  containerStyle: StyleProp<ViewStyle>;
  onClose: () => void;
};

function NativeVideoPlayer({ uri, containerStyle, onClose }: NativeVideoPlayerProps) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const mod = getExpoVideoModule()!;
  const { useVideoPlayer, VideoView } = mod;

  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  const playerRef = useRef(player);
  playerRef.current = player;

  useEffect(() => {
    return () => {
      try {
        playerRef.current.pause();
      } catch {
        // ignore
      }
    };
  }, []);

  return (
    <View style={containerStyle}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls
      />
      <Pressable style={styles.closeVideoBtn} onPress={onClose} hitSlop={8}>
        <AppIcon name="close-circle" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    /* Add button (idle state) */
    addBtn: {
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.borderSoft,
      borderStyle: 'dashed',
    },
    addBtnInner: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.bgSurface,
    },
    addBtnText: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
    },
    addBtnSub: {
      ...typography.micro,
      color: colors.textMuted,
    },

    /* Card (after pick) */
    card: {
      borderRadius: radius.xl,
      overflow: 'hidden',
      backgroundColor: colors.bgSurface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },

    /* Video preview — height driven by aspectRatio style prop */
    previewContainer: {
      width: '100%',
      backgroundColor: '#000',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },

    /* Play / close buttons */
    playBtn: {
      position: 'absolute',
      alignSelf: 'center',
      top: '40%',
    },
    playBtnCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeVideoBtn: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.sm,
    },

    /* Upload overlay */
    uploadOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.7)',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
    },
    uploadOverlayText: {
      ...typography.bodyStrong,
      color: '#fff',
    },
    progressBar: {
      width: 180,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.2)',
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.electricBright,
      borderRadius: 2,
    },

    /* Metadata row */
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    metaInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    metaText: {
      ...typography.caption,
      color: colors.textMuted,
    },
    metaActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    actionBtn: {
      padding: 4,
    },
    tileBtn: {
      flex: 1,
      minHeight: 108,
      borderRadius: radius.lg,
      backgroundColor: colors.bgSurface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
    },
    tileTitle: {
      ...typography.feedTitle,
      color: colors.textPrimary,
    },
    tileSub: {
      ...typography.caption,
      color: colors.textMuted,
      textAlign: 'center',
    },
  });
}
