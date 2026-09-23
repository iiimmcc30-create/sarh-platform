import { rtlInputText } from '@/lib/rtl';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/services/api';
import { uploadMediaFromUri } from '@/services/upload';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image } from '@/components/ui/AppImage';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { StoryVideoPlayer } from '@/components/feature/StoryVideoPlayer';
import { StoryVideoTrimmer } from '@/components/feature/StoryVideoTrimmer';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  STORY_MAX_DURATION_SEC,
  STORY_MIN_DURATION_SEC,
} from '@/constants/stories';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { alertMessage } from '@/lib/actionSheet';
import {
  resolveStoryThumbnailUri,
  requiresStoryVideoTrim,
  storyDurationForKind,
  storyDurationFromAsset,
  validateStoryVideoDuration,
  type StoryMediaKind,
} from '@/lib/storyMedia';

type StoryDraft = {
  uri: string;
  kind: StoryMediaKind;
  durationSec: number;
};

type PendingVideoTrim = {
  uri: string;
  durationSec: number;
};

type PublishStage = 'idle' | 'uploading' | 'publishing';

function StoryVideoPreview({ uri }: { uri: string }) {
  return <StoryVideoPlayer uri={uri} style={StyleSheet.absoluteFill} muted loop />;
}

export default function CreateStoryScreen() {
  const { gradients } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const insets = useSafeAreaInsets();

  const router = useRouter();
  const { accessToken } = useAuth();

  const [media, setMedia] = useState<StoryDraft | null>(null);
  const [pendingTrim, setPendingTrim] = useState<PendingVideoTrim | null>(null);
  const [captionAr, setCaptionAr] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [publishStage, setPublishStage] = useState<PublishStage>('idle');
  const [showOptions, setShowOptions] = useState(false);

  const processAsset = (asset: ImagePickerAsset) => {
    const isVideo = asset.type === 'video' || (asset.mimeType?.startsWith('video/') ?? false);

    if (isVideo) {
      const durationSec = storyDurationFromAsset(asset.duration);
      if (durationSec != null && durationSec < STORY_MIN_DURATION_SEC) {
        Alert.alert(
          'مدة الفيديو',
          `مدة الفيديو يجب أن تكون ${STORY_MIN_DURATION_SEC} ثوانٍ على الأقل`,
        );
        return;
      }

      if (durationSec == null || requiresStoryVideoTrim(durationSec)) {
        setPendingTrim({
          uri: asset.uri,
          durationSec: durationSec ?? 120,
        });
        return;
      }

      const durationError = validateStoryVideoDuration(durationSec);
      if (durationError) {
        Alert.alert('مدة الفيديو', durationError);
        return;
      }

      setMedia({
        uri: asset.uri,
        kind: 'video',
        durationSec: storyDurationForKind('video', durationSec),
      });
      return;
    }

    setMedia({
      uri: asset.uri,
      kind: 'image',
      durationSec: storyDurationForKind('image', null),
    });
  };

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('إذن مطلوب', 'يرجى السماح بالوصول إلى الصور والفيديو لنشر قصة');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: Platform.OS === 'ios',
      aspect: [9, 16],
      quality: 0.85,
      videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
    });

    if (result.canceled || !result.assets[0]) return;
    processAsset(result.assets[0]);
  };

  const captureFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('إذن مطلوب', 'يرجى السماح بالوصول إلى الكاميرا لالتقاط قصة');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: Platform.OS === 'ios',
      aspect: [9, 16],
      quality: 0.85,
      videoMaxDuration: STORY_MAX_DURATION_SEC,
    });

    if (result.canceled || !result.assets[0]) return;
    processAsset(result.assets[0]);
  };

  const openVideoTrimmer = () => {
    if (!media || media.kind !== 'video') return;
    setPendingTrim({ uri: media.uri, durationSec: media.durationSec });
  };

  const handlePublish = async () => {
    if (!accessToken) {
      Alert.alert('تسجيل الدخول', 'يجب تسجيل الدخول لنشر قصة');
      return;
    }
    if (!media) {
      Alert.alert('محتوى مطلوب', 'اختر صورة أو فيديو للقصة أولاً');
      return;
    }

    setSubmitting(true);
    setPublishStage('uploading');
    try {
      const thumbnailLocalUri = await resolveStoryThumbnailUri(media);

      let thumbnailUrl: string;
      let mediaUrl: string;
      try {
        if (media.kind === 'video') {
          [thumbnailUrl, mediaUrl] = await Promise.all([
            uploadMediaFromUri(accessToken, thumbnailLocalUri, 'stories', 'image'),
            uploadMediaFromUri(accessToken, media.uri, 'stories', 'video'),
          ]);
        } else {
          thumbnailUrl = await uploadMediaFromUri(accessToken, thumbnailLocalUri, 'stories', 'image');
          mediaUrl = thumbnailUrl;
        }
      } catch {
        if (__DEV__) {
          thumbnailUrl = `https://picsum.photos/seed/${Date.now()}/720/1280`;
          mediaUrl = thumbnailUrl;
        } else {
          throw new Error('تعذّر رفع الملف. تحقق من الاتصال وحاول مجدداً.');
        }
      }

      setPublishStage('publishing');

      const endpoint = `${API_BASE}/api/stories`;
      const shared = {
        thumbnail: thumbnailUrl,
        captionAr: captionAr.trim() || null,
        caption: captionAr.trim() || null,
        duration: media.durationSec,
      };
      const body = {
        ...shared,
        mediaUrl,
        location: location.trim() || null,
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        const msg = json.messageAr || json.message || 'فشل نشر القصة';
        Alert.alert('خطأ', msg);
        return;
      }

      await alertMessage('تم النشر', 'قصتك متاحة الآن لمدة ٢٤ ساعة');
      router.back();
    } catch (err: unknown) {
      Alert.alert('خطأ', err instanceof Error ? err.message : 'تعذّر نشر القصة');
    } finally {
      setSubmitting(false);
      setPublishStage('idle');
    }
  };

  const publishLabel =
    publishStage === 'uploading'
      ? 'جاري الرفع...'
      : publishStage === 'publishing'
        ? 'جاري النشر...'
        : 'نشر';

  return (
    <View style={styles.root}>
      {media ? (
        <>
          {media.kind === 'video' ? (
            <StoryVideoPreview uri={media.uri} />
          ) : (
            <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.75)']}
            locations={[0, 0.35, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </>
      ) : (
        <LinearGradient colors={gradients.royal} style={StyleSheet.absoluteFill} />
      )}

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
        >
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} style={styles.topBtn} hitSlop={8}>
              <AppIcon name="close" size={24} color="#fff" />
            </Pressable>
            <Text style={styles.topTitle}>قصة جديدة</Text>
            {media ? (
              <Pressable
                onPress={handlePublish}
                disabled={submitting}
                style={[styles.publishChip, submitting && { opacity: 0.6 }]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.publishChipText}>{publishLabel}</Text>
                )}
              </Pressable>
            ) : (
              <View style={styles.topBtnPlaceholder} />
            )}
          </View>

          {!media ? (
            <View style={styles.pickerBody}>
              <View style={styles.pickerHero}>
                <View style={styles.pickerFrame}>
                  <AppIcon name="add-circle-outline" size={48} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.pickerTitle}>شارك لحظتك</Text>
                  <Text style={styles.pickerSub}>
                    تظهر لمدة ٢٤ ساعة · {STORY_MIN_DURATION_SEC}–{STORY_MAX_DURATION_SEC} ث للفيديو
                  </Text>
                </View>
              </View>

              <View style={styles.pickerActions}>
                <Pressable style={styles.pickerBtn} onPress={captureFromCamera}>
                  <View style={styles.pickerBtnIcon}>
                    <AppIcon name="camera" size={26} color="#fff" />
                  </View>
                  <Text style={styles.pickerBtnLabel}>كاميرا</Text>
                </Pressable>
                <Pressable style={styles.pickerBtn} onPress={pickFromLibrary}>
                  <View style={styles.pickerBtnIcon}>
                    <AppIcon name="images" size={26} color="#fff" />
                  </View>
                  <Text style={styles.pickerBtnLabel}>المعرض</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.editorBody}>
              <View style={styles.editorTools}>
                {media.kind === 'video' ? (
                  <Pressable style={styles.toolChip} onPress={openVideoTrimmer}>
                    <AppIcon name="cut-outline" size={16} color="#fff" />
                    <Text style={styles.toolChipText}>{media.durationSec} ث · قص</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={styles.toolChip}
                  onPress={() => {
                    setMedia(null);
                    setCaptionAr('');
                    setLocation('');
                  }}
                >
                  <AppIcon name="refresh-outline" size={16} color="#fff" />
                  <Text style={styles.toolChipText}>تغيير</Text>
                </Pressable>
                <Pressable style={styles.toolChip} onPress={() => setShowOptions((v) => !v)}>
                  <AppIcon name="options-outline" size={16} color="#fff" />
                  <Text style={styles.toolChipText}>خيارات</Text>
                </Pressable>
              </View>

              {showOptions ? (
                <ScrollView
                  style={styles.optionsPanel}
                  contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}
                  keyboardShouldPersistTaps="handled"
                >
                  <TextInput
                      style={[styles.optionInput, rtlInputText]}
                      value={location}
                      onChangeText={setLocation}
                      placeholder="📍 الموقع (اختياري)"
                      placeholderTextColor="rgba(255,255,255,0.45)"
                      maxLength={120}
                    />
                </ScrollView>
              ) : null}

              <View style={[styles.captionBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
                <TextInput
                  style={[styles.captionInput, rtlInputText]}
                  value={captionAr}
                  onChangeText={setCaptionAr}
                  placeholder="اكتب تعليقاً..."
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  maxLength={200}
                  multiline
                />
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <StoryVideoTrimmer
        visible={pendingTrim != null}
        uri={pendingTrim?.uri ?? ''}
        durationSec={pendingTrim?.durationSec ?? STORY_MAX_DURATION_SEC}
        onCancel={() => setPendingTrim(null)}
        onConfirm={({ uri, durationSec }) => {
          setMedia({ uri, kind: 'video', durationSec });
          setPendingTrim(null);
        }}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    safe: { flex: 1 },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      zIndex: 10,
    },
    topBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    topBtnPlaceholder: { width: 40 },
    topTitle: {
      ...typography.cardHeading,
      color: '#fff',
    },
    publishChip: {
      backgroundColor: colors.electric,
      paddingHorizontal: spacing.lg,
      paddingVertical: 9,
      borderRadius: radius.pill,
      minWidth: 72,
      alignItems: 'center',
    },
    publishChipText: {
      ...typography.button,
      color: '#fff',
    },
    pickerBody: {
      flex: 1,
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
    },
    pickerHero: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerFrame: {
      width: '72%',
      aspectRatio: 9 / 16,
      maxHeight: 420,
      borderRadius: radius.xxl,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.35)',
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: spacing.lg,
      backgroundColor: 'rgba(0,0,0,0.2)',
    },
    pickerTitle: {
      ...typography.h3,
      color: '#fff',
      marginTop: spacing.xs,
    },
    pickerSub: {
      ...typography.caption,
      color: 'rgba(255,255,255,0.72)',
      textAlign: 'center',
      lineHeight: 18,
    },
    pickerActions: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.xxl,
    },
    pickerBtn: {
      alignItems: 'center',
      gap: spacing.sm,
    },
    pickerBtnIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerBtnLabel: {
      ...typography.bodyStrong,
      color: '#fff',
    },
    editorBody: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    editorTools: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    toolChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.pill,
      backgroundColor: 'rgba(0,0,0,0.42)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.28)',
    },
    toolChipText: {
      ...typography.caption,
      color: '#fff',
      fontWeight: '600',
    },
    optionsPanel: {
      maxHeight: 140,
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
      backgroundColor: 'rgba(0,0,0,0.38)',
      borderRadius: radius.lg,
      padding: spacing.sm,
    },
    optionInput: {
      minHeight: 44,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      paddingHorizontal: spacing.md,
      color: '#fff',
      ...typography.body,
    },
    captionBar: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    captionInput: {
      minHeight: 48,
      maxHeight: 100,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.35)',
      backgroundColor: 'rgba(0,0,0,0.35)',
      paddingHorizontal: spacing.lg,
      paddingVertical: Platform.OS === 'ios' ? 12 : 10,
      color: '#fff',
      ...typography.body,
      textAlignVertical: 'center',
    },
  });
}
