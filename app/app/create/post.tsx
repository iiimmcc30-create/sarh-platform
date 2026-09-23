import { SarhChip, SarhChipRow, SarhButton } from '@/design-system/components';
// Powered by OnSpace.AI
// SAFAT — Create Post Screen (إنشاء منشور - نظام X)
import { AppIcon } from '@/components/ui/FlaticonIcon';

import { Image } from '@/components/ui/AppImage';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import { uploadMediaFromUri } from '@/services/upload';
import { rtlInputText, ltrInputText } from '@/lib/rtl';
import { cloudinaryVideoFirstFrameUrl } from '@/lib/listingMedia';

const HASHTAG_BLUE = '#1D9BF0';
const MAX_POST_MEDIA = 4;

type DraftMedia = {
  uri: string;
  kind: 'image' | 'video';
};

const POST_TYPES = [
  { id: 'text', label: 'نص' },
  { id: 'image', label: 'صورة' },
  { id: 'poll', label: 'استطلاع' },
  { id: 'listing', label: 'إعلان' },
];

const SUGGESTED_HASHTAGS = [
  '#إبل', '#خيول', '#أغنام', '#صقور', '#مزاد', '#سرح', '#سوق_الخليج', '#ماشية',
];

export default function CreatePostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, gradients } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const isEditing = !!editId;
  const { me, addPost, updatePost } = useApp();
  const { accessToken } = useAuth();

  const [arabicContent, setArabicContent] = useState('');
  const [selectedType, setSelectedType] = useState('text');
  const [selectedHashtags, setSelectedHashtags] = useState<string[]>([]);
  const [draftMedia, setDraftMedia] = useState<DraftMedia[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingPost, setLoadingPost] = useState(!!editId);

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

  const MAX_CHARS = 280;
  const remaining = MAX_CHARS - arabicContent.length;
  const canPost = arabicContent.trim() && remaining >= 0;

  const toggleHashtag = (tag: string) => {
    setSelectedHashtags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const insertHashtag = (tag: string) => {
    const separator = arabicContent.endsWith(' ') || arabicContent.length === 0 ? '' : ' ';
    setArabicContent((prev) => prev + separator + tag + ' ');
    toggleHashtag(tag);
  };

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('إذن مطلوب', 'يرجى السماح بالوصول إلى الصور والفيديو لإضافتها للمنشور');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_POST_MEDIA - draftMedia.length,
      quality: 0.85,
      videoMaxDuration: 90,
    });

    if (!result.canceled && result.assets.length > 0) {
      const picked: DraftMedia[] = result.assets.map((asset) => ({
        uri: asset.uri,
        kind:
          asset.type === 'video' || (asset.mimeType?.startsWith('video/') ?? false)
            ? 'video'
            : 'image',
      }));
      setDraftMedia((prev) => [...prev, ...picked].slice(0, MAX_POST_MEDIA));
      setSelectedType('image');
    }
  };

  const removeMedia = (index: number) => {
    setDraftMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePost = async () => {
    if (!canPost || !accessToken) return;
    setSubmitting(true);
    const text = arabicContent.trim();

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
      setSubmitting(false);
    }
  };

  if (loadingPost) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ ...typography.body, color: colors.textMuted }}>جاري التحميل...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 12}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.cancelBtn} hitSlop={8}>
            <Text style={styles.cancelText}>إلغاء</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{isEditing ? 'تعديل المنشور' : 'منشور جديد'}</Text>
          <SarhButton
            title={submitting ? '...' : isEditing ? 'حفظ' : 'نشر'}
            size="sm"
            loading={submitting}
            disabled={!canPost}
            onPress={handlePost}
          />
        </View>

        {/* Post type selector */}
        <SarhChipRow contentPaddingHorizontal={spacing.lg} style={styles.typeRow}>
          {POST_TYPES.map((t) => (
            <SarhChip appearance="filter"
              key={t.id}
              label={t.label}
              selected={selectedType === t.id}
              onPress={() => setSelectedType(t.id)}
            />
          ))}
        </SarhChipRow>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Compose area */}
          <View style={styles.composeRow}>
            <Image source={{ uri: me.avatar }} style={styles.avatar} contentFit="cover" />
            <View style={styles.composeFields}>
              {/* Arabic (main) */}
              <TextInput
                value={arabicContent}
                onChangeText={setArabicContent}
                placeholder="ماذا يدور في ذهنك؟ 🐪"
                placeholderTextColor={colors.textMuted}
                style={[styles.textInput, styles.textInputAr]}
                multiline
                maxLength={MAX_CHARS}
                autoFocus
              />
            </View>
          </View>

          {/* Image previews */}
          {draftMedia.length > 0 && (
            <View style={styles.imagePreviewRow}>
              {draftMedia.map((item, index) => (
                <View key={`${item.kind}-${item.uri}-${index}`} style={styles.imagePreviewWrap}>
                  {item.kind === 'video' ? (
                    <View style={[styles.imagePreview, styles.videoPreview]}>
                      <Image
                        source={{
                          uri: cloudinaryVideoFirstFrameUrl(item.uri) ?? item.uri,
                        }}
                        style={styles.imagePreview}
                        contentFit="cover"
                      />
                      <View style={styles.videoPlayBadge} pointerEvents="none">
                        <AppIcon name="play" size={14} color="#fff" />
                      </View>
                    </View>
                  ) : (
                    <Image source={{ uri: item.uri }} style={styles.imagePreview} contentFit="cover" />
                  )}
                  <Pressable
                    style={styles.imageRemoveBtn}
                    onPress={() => removeMedia(index)}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={item.kind === 'video' ? 'حذف الفيديو' : 'حذف الصورة'}
                  >
                    <AppIcon name="close" size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {draftMedia.length < MAX_POST_MEDIA && (
                <Pressable style={styles.imageAddBtn} onPress={pickMedia}>
                  <AppIcon name="add" size={24} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          )}

          {/* Audience */}
          <Pressable style={styles.audienceRow}>
            <AppIcon name="earth" size={14} color={colors.electricBright} />
            <Text style={styles.audienceText}>الجميع يمكنهم الرد</Text>
            <AppIcon name="chevron-down" size={14} color={colors.electricBright} />
          </Pressable>

          {/* Hashtag suggestions */}
          <View style={styles.hashtagSection}>
            <Text style={styles.hashtagTitle}>الوسوم الشائعة</Text>
            <View style={styles.hashtagRow}>
              {SUGGESTED_HASHTAGS.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => insertHashtag(tag)}
                  style={[
                    styles.hashtagChip,
                    selectedHashtags.includes(tag) && styles.hashtagChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.hashtagText,
                      selectedHashtags.includes(tag) && styles.hashtagTextActive,
                    ]}
                  >
                    {tag}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Preview */}
          {arabicContent.trim().length > 0 && (
            <View style={styles.previewSection}>
              <Text style={styles.previewLabel}>معاينة</Text>
              <View style={styles.previewCard}>
                <View style={styles.previewHeader}>
                  <Image source={{ uri: me.avatar }} style={styles.previewAvatar} contentFit="cover" />
                  <View>
                    <Text style={styles.previewName}>{me.arabicName}</Text>
                    <Text style={styles.previewHandle}>@{me.username} · الآن</Text>
                  </View>
                </View>
                {arabicContent ? (
                  <Text style={styles.previewText}>{arabicContent}</Text>
                ) : null}
                {draftMedia.length > 0 && (
                  <View style={styles.previewImagesRow}>
                    {draftMedia.map((item, index) => (
                      <View key={`${item.kind}-${item.uri}-${index}`} style={styles.previewImageThumb}>
                        <Image
                          source={{
                            uri:
                              item.kind === 'video'
                                ? cloudinaryVideoFirstFrameUrl(item.uri) ?? item.uri
                                : item.uri,
                          }}
                          style={styles.previewImageThumb}
                          contentFit="cover"
                        />
                        {item.kind === 'video' ? (
                          <View style={styles.previewVideoBadge} pointerEvents="none">
                            <AppIcon name="play" size={10} color="#fff" />
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>

        {/* Bottom toolbar — lifted above system nav / keyboard */}
        <View
          style={[
            styles.toolbar,
            { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm },
          ]}
        >
          <View style={styles.toolbarLeft}>
            {[
              { icon: 'image-outline', label: 'صورة', action: pickMedia },
              { icon: 'location-outline', label: 'موقع' },
              { icon: 'at-outline', label: 'إشارة' },
              { icon: 'link-outline', label: 'رابط' },
            ].map((tool) => (
              <Pressable
                key={tool.icon}
                style={styles.toolBtn}
                hitSlop={8}
                onPress={tool.action}
              >
                <AppIcon name={tool.icon} size={20} color={colors.electricBright} />
              </Pressable>
            ))}
          </View>
          <View style={styles.charCountWrap}>
            <View style={[
              styles.charRing,
              remaining < 20 && { borderColor: colors.amber },
              remaining < 0 && { borderColor: colors.rose },
            ]}>
              <Text style={[
                styles.charCountText,
                remaining < 20 && { color: colors.amber },
                remaining < 0 && { color: colors.rose },
              ]}>
                {remaining}
              </Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.screenRoot },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  cancelBtn: { paddingHorizontal: 4 },
  cancelText: { ...typography.body, color: colors.textSecondary },
  headerTitle: { ...typography.h3, color: colors.textPrimary },
  postBtn: { borderRadius: radius.pill, overflow: 'hidden' },
  postBtnDisabled: { opacity: 0.5 },
  postBtnInner: {
    paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radius.pill,
  },
  postBtnText: { ...typography.bodyStrong, color: '#fff' },
  typeRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  scroll: { paddingBottom: 20 },
  composeRow: {
    flexDirection: 'row', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 20,
    borderWidth: 1, borderColor: colors.borderMid,
    marginTop: 4,
  },
  composeFields: { flex: 1, gap: spacing.sm },
  textInput: {
    ...typography.body, color: colors.textPrimary,
    minHeight: 60, maxHeight: 200,
    paddingTop: 0,
  },
  textInputAr: { ...rtlInputText, ...typography.body },
  textInputEn: { ...ltrInputText, ...typography.secondary, color: colors.textSecondary },
  audienceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    paddingVertical: 8, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.electric,
    alignSelf: 'flex-end',
    backgroundColor: `${colors.electric}10`,
  },
  audienceText: { ...typography.caption, color: colors.textBrandStrong },
  hashtagSection: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  hashtagTitle: { ...typography.micro, color: colors.textMuted, marginBottom: spacing.sm },
  hashtagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hashtagChip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill, backgroundColor: colors.bgSurface,
    borderWidth: 1, borderColor: colors.borderSoft,
  },
  hashtagChipActive: { backgroundColor: `${HASHTAG_BLUE}18`, borderColor: HASHTAG_BLUE },
  hashtagText: { ...typography.caption, color: colors.textMuted },
  hashtagTextActive: { color: HASHTAG_BLUE },
  previewSection: { padding: spacing.lg, gap: spacing.sm },
  previewLabel: { ...typography.micro, color: colors.textMuted },
  previewCard: {
    padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.borderSoft,
    gap: spacing.sm,
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  previewAvatar: { width: 32, height: 32, borderRadius: 16 },
  previewName: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  previewHandle: { ...typography.micro, color: colors.textMuted },
  previewText: { ...typography.body, color: colors.textPrimary, lineHeight: 24, writingDirection: 'rtl' },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  previewImagesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  previewImageThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
  },
  imagePreviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  imagePreviewWrap: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  videoPreview: {
    backgroundColor: '#000',
  },
  videoPlayBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  previewVideoBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: radius.md,
  },
  imageRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageAddBtn: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSurface,
  },
  previewSubText: { ...typography.caption, color: colors.textSecondary },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.borderSoft,
    backgroundColor: colors.bgDeep,
    minHeight: 56,
  },
  toolbarLeft: { flexDirection: 'row', gap: spacing.sm },
  toolBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  charCountWrap: { alignItems: 'center', justifyContent: 'center' },
  charRing: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 2, borderColor: colors.electric,
    alignItems: 'center', justifyContent: 'center',
  },
  charCountText: { ...typography.badge, color: colors.textBrandAlt },
  });
}
