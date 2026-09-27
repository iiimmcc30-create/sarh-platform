// SAFAT — Create Post Screen (X-style composer)
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image } from '@/components/ui/AppImage';
import { ComposerKeyboardView } from '@/components/ui/ComposerKeyboardView';
import { useComposerKeyboardPad } from '@/hooks/useComposerKeyboardPad';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import { uploadMediaFromUri } from '@/services/upload';
import { rtlInputText } from '@/lib/rtl';
import { cloudinaryVideoFirstFrameUrl } from '@/lib/listingMedia';

const MAX_POST_MEDIA = 4;
const MAX_CHARS = 280;
const AVATAR_SIZE = 40;
const MEDIA_TILE = 96;

type DraftMedia = {
  uri: string;
  kind: 'image' | 'video';
};

function assetKind(asset: ImagePicker.ImagePickerAsset): DraftMedia['kind'] {
  return asset.type === 'video' || (asset.mimeType?.startsWith('video/') ?? false)
    ? 'video'
    : 'image';
}

export default function CreatePostScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const isEditing = !!editId;
  const { me, addPost, updatePost } = useApp();
  const { accessToken } = useAuth();
  const { keyboardVisible, restingBottom } = useComposerKeyboardPad();

  const [arabicContent, setArabicContent] = useState('');
  const [draftMedia, setDraftMedia] = useState<DraftMedia[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [loadingPost, setLoadingPost] = useState(!!editId);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!editId || !accessToken) return;
    let active = true;
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/posts/${editId}`);
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (res.ok && json.success && json.data) {
          setArabicContent(json.data.arabicContent ?? json.data.content ?? '');
        } else {
          Alert.alert('خطأ', 'تعذر تحميل المنشور');
          router.back();
        }
      } catch {
        if (active) {
          Alert.alert('خطأ', 'تعذر تحميل المنشور');
          router.back();
        }
      } finally {
        if (active) setLoadingPost(false);
      }
    })();
    return () => { active = false; };
  }, [editId, accessToken, router]);

  const text = arabicContent.trim();
  const remaining = MAX_CHARS - arabicContent.length;
  // Editing keeps the existing text-only contract (the edit API requires text).
  const hasContent = isEditing ? text.length > 0 : text.length > 0 || draftMedia.length > 0;
  const canPost = hasContent && remaining >= 0 && !submitting;
  const mediaSlots = MAX_POST_MEDIA - draftMedia.length;
  const canAddMedia = mediaSlots > 0 && !submitting && !picking;

  const appendAssets = useCallback((assets: ImagePicker.ImagePickerAsset[]) => {
    if (assets.length === 0) return;
    const picked: DraftMedia[] = assets.map((asset) => ({ uri: asset.uri, kind: assetKind(asset) }));
    setDraftMedia((prev) => [...prev, ...picked].slice(0, MAX_POST_MEDIA));
  }, []);

  const pickMedia = useCallback(async () => {
    if (!canAddMedia) return;
    setPicking(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('إذن مطلوب', 'يرجى السماح بالوصول إلى الصور والفيديو لإضافتها للمنشور');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: mediaSlots,
        quality: 0.85,
        videoMaxDuration: 90,
      });
      if (!result.canceled) appendAssets(result.assets);
    } finally {
      setPicking(false);
    }
  }, [appendAssets, canAddMedia, mediaSlots]);

  const captureMedia = useCallback(async () => {
    if (!canAddMedia) return;
    setPicking(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('إذن مطلوب', 'يرجى السماح باستخدام الكاميرا لالتقاط صورة أو فيديو');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.85,
        videoMaxDuration: 90,
      });
      if (!result.canceled) appendAssets(result.assets);
    } finally {
      setPicking(false);
    }
  }, [appendAssets, canAddMedia]);

  const removeMedia = (index: number) => {
    setDraftMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePost = async () => {
    if (!canPost || !accessToken || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    try {
      const uploaded: Array<{ url: string; type: 'IMAGE' | 'VIDEO'; sortOrder: number }> = [];
      for (let i = 0; i < draftMedia.length; i += 1) {
        const item = draftMedia[i];
        const url = await uploadMediaFromUri(
          accessToken,
          item.uri,
          'posts',
          item.kind === 'video' ? 'video' : 'image',
        );
        if (url) {
          uploaded.push({
            url,
            type: item.kind === 'video' ? 'VIDEO' : 'IMAGE',
            sortOrder: uploaded.length,
          });
        }
      }

      if (draftMedia.length > 0 && uploaded.length === 0) {
        Alert.alert('خطأ', 'فشل رفع الوسائط. حاول مجدداً.');
        return;
      }

      const imageUrls = uploaded.filter((item) => item.type === 'IMAGE').map((item) => item.url);
      const payload = {
        content: text,
        arabicContent: text,
        ...(uploaded.length > 0 ? { media: uploaded } : {}),
        ...(imageUrls.length > 0 ? { images: imageUrls, image: imageUrls[0] } : {}),
      };

      const success = isEditing && editId
        ? await updatePost(editId, payload)
        : await addPost(payload);

      if (success) {
        router.back();
      } else {
        Alert.alert('خطأ', isEditing ? 'فشل تحديث المنشور.' : 'فشل نشر المنشور. يرجى المحاولة لاحقاً.');
      }
    } catch {
      Alert.alert('خطأ', 'حدث خطأ أثناء النشر. حاول مجدداً.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (loadingPost) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.electricBright} />
      </SafeAreaView>
    );
  }

  const nearLimit = remaining <= 20;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ComposerKeyboardView>
        {/* Header — close on the start (right in RTL), post pill on the end (left). */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.closeBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
            disabled={submitting}
          >
            <AppIcon name="close" size={24} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={handlePost}
            disabled={!canPost}
            style={({ pressed }) => [
              styles.postBtn,
              !canPost && !submitting && styles.postBtnDisabled,
              pressed && canPost && styles.postBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={isEditing ? 'حفظ' : 'نشر'}
            accessibilityState={{ disabled: !canPost, busy: submitting }}
            testID="create-post-submit"
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.postBtnText}>{isEditing ? 'حفظ' : 'نشر'}</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.composeRow}>
            {me.avatar ? (
              <Image source={{ uri: me.avatar }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <AppIcon name="person" size={20} color={colors.textMuted} />
              </View>
            )}
            <TextInput
              value={arabicContent}
              onChangeText={setArabicContent}
              placeholder="ماذا يحدث؟"
              placeholderTextColor={colors.textMuted}
              style={styles.textInput}
              multiline
              maxLength={MAX_CHARS}
              autoFocus
              editable={!submitting}
              textAlignVertical="top"
              scrollEnabled={false}
              accessibilityLabel="نص المنشور"
            />
          </View>

          {draftMedia.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mediaRow}
              keyboardShouldPersistTaps="handled"
            >
              {draftMedia.map((item, index) => (
                <View key={`${item.kind}-${item.uri}-${index}`} style={styles.mediaTile}>
                  <Image
                    source={{
                      uri:
                        item.kind === 'video'
                          ? cloudinaryVideoFirstFrameUrl(item.uri) ?? item.uri
                          : item.uri,
                    }}
                    style={[styles.mediaImage, item.kind === 'video' && styles.videoBg]}
                    contentFit="cover"
                  />
                  {item.kind === 'video' ? (
                    <View style={styles.videoBadge} pointerEvents="none">
                      <AppIcon name="play" size={16} color="#fff" />
                    </View>
                  ) : null}
                  <Pressable
                    style={styles.mediaRemoveBtn}
                    onPress={() => removeMedia(index)}
                    hitSlop={6}
                    disabled={submitting}
                    accessibilityRole="button"
                    accessibilityLabel={item.kind === 'video' ? 'حذف الفيديو' : 'حذف الصورة'}
                  >
                    <AppIcon name="close" size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {canAddMedia ? (
                <Pressable
                  style={styles.mediaAddTile}
                  onPress={pickMedia}
                  accessibilityRole="button"
                  accessibilityLabel="إضافة وسائط"
                >
                  <AppIcon name="add" size={24} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </ScrollView>
          ) : null}
        </ScrollView>

        {/* Toolbar — sits on the keyboard (KAV) or above the system bar when hidden. */}
        <View style={[styles.toolbar, { paddingBottom: keyboardVisible ? spacing.sm : Math.max(restingBottom, spacing.sm) }]}>
          {nearLimit ? (
            <Text
              style={[styles.counter, remaining < 0 && { color: colors.rose }]}
              accessibilityLabel={`متبقٍ ${remaining} حرفاً`}
            >
              {remaining}
            </Text>
          ) : (
            <View />
          )}
          <View style={styles.toolbarIcons}>
            <Pressable
              onPress={captureMedia}
              disabled={!canAddMedia}
              style={[styles.toolBtn, !canAddMedia && styles.toolBtnDisabled]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="الكاميرا"
              accessibilityState={{ disabled: !canAddMedia }}
            >
              <AppIcon name="camera-outline" size={22} color={colors.electricBright} />
            </Pressable>
            <Pressable
              onPress={pickMedia}
              disabled={!canAddMedia}
              style={[styles.toolBtn, !canAddMedia && styles.toolBtnDisabled]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="الصور والفيديو"
              accessibilityState={{ disabled: !canAddMedia }}
            >
              <AppIcon name="image-outline" size={22} color={colors.electricBright} />
            </Pressable>
          </View>
        </View>
      </ComposerKeyboardView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.screenRoot },
    flex: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      minHeight: 52,
    },
    closeBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
    },
    postBtn: {
      minWidth: 68,
      height: 34,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.electric,
    },
    // Light tint of the brand colour while empty/disabled (reference: pale pill).
    postBtnDisabled: { opacity: 0.45 },
    postBtnPressed: { opacity: 0.85 },
    postBtnText: { ...typography.smallHeading, fontWeight: '700', color: '#FFFFFF' },
    scroll: { flexGrow: 1, paddingBottom: spacing.lg },
    composeRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      backgroundColor: colors.bgSurface,
    },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    textInput: {
      ...rtlInputText,
      flex: 1,
      fontSize: 19,
      lineHeight: 28,
      color: colors.textPrimary,
      minHeight: 160,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      paddingHorizontal: 0,
    },
    mediaRow: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingStart: spacing.lg + AVATAR_SIZE + spacing.md,
    },
    mediaTile: {
      width: MEDIA_TILE,
      height: MEDIA_TILE,
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: colors.bgSurface,
    },
    mediaImage: { width: '100%', height: '100%' },
    videoBg: { backgroundColor: '#000' },
    videoBadge: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.28)',
    },
    mediaRemoveBtn: {
      position: 'absolute',
      top: 4,
      end: 4,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    mediaAddTile: {
      width: MEDIA_TILE,
      height: MEDIA_TILE,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSoft,
      backgroundColor: colors.screenRoot,
    },
    toolbarIcons: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    toolBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
    },
    toolBtnDisabled: { opacity: 0.4 },
    counter: { ...typography.secondary, color: colors.textMuted, paddingHorizontal: spacing.sm },
  });
}
