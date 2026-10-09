import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image, uriSource } from '@/components/ui/AppImage';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText, SarhButton } from '@/design-system/components';
import { Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { showToast } from '@/lib/toast';
import { getAccessToken } from '@/services/authFetch';
import { uploadImageFromUri } from '@/services/upload';
import {
  COUNCIL_SHOW_IMAGE_LABEL,
  councilErrorMessage,
  fetchCouncilImageSources,
  type CouncilImageSources,
} from '@/services/councils';
import { CouncilSheet } from './CouncilSheet';

export type CouncilImagePick = { imageUrl: string; listingId: string | null };

type Props = {
  visible: boolean;
  busy: boolean;
  onPick: (pick: CouncilImagePick) => void;
  onClose: () => void;
};

const THUMB = 76;

/** «عرض صورة» picker: a photo from one of my listings, or one from the gallery. */
export function CouncilImagePickerSheet({ visible, busy, onPick, onClose }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const [sources, setSources] = useState<CouncilImageSources | null>(null);
  const [uploading, setUploading] = useState(false);
  // First open shows a spinner; later opens show the cached photos while refreshing.
  const loading = visible && sources === null;

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    fetchCouncilImageSources()
      .then((r) => {
        if (alive) setSources(r);
      })
      .catch((err) => {
        if (!alive) return;
        setSources((prev) => prev ?? { canShowImages: false, listings: [] });
        void showToast(councilErrorMessage(err), 'error');
      });
    return () => {
      alive = false;
    };
  }, [visible]);

  const fromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        void showToast('يرجى السماح للتطبيق بالوصول إلى الصور', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (result.canceled || !result.assets[0]) return;
      const token = getAccessToken();
      if (!token) return;
      setUploading(true);
      const url = await uploadImageFromUri(token, result.assets[0].uri, 'posts');
      onPick({ imageUrl: url, listingId: null });
    } catch (err) {
      void showToast(err instanceof Error && err.message ? err.message : 'تعذّر رفع الصورة', 'error');
    } finally {
      setUploading(false);
    }
  };

  const listings = sources?.listings ?? [];
  return (
    <CouncilSheet
      visible={visible}
      title={COUNCIL_SHOW_IMAGE_LABEL}
      subtitle="تظهر الصورة لجميع الحاضرين أعلى المجلس"
      onClose={onClose}
      footer={
        <SarhButton
          title="اختيار من المعرض"
          leftIcon="image-outline"
          variant="secondary"
          shape="pill"
          fullWidth
          loading={uploading || busy}
          disabled={uploading || busy}
          onPress={() => void fromGallery()}
        />
      }
    >
      {loading ? (
        <ActivityIndicator color={colors.textMuted} style={styles.loading} />
      ) : listings.length === 0 ? (
        <AppText variant="bodySmall" color="textMuted" align="center" style={styles.empty}>
          لا توجد صور في إعلاناتك النشطة
        </AppText>
      ) : (
        <Stack gap="lg">
          <AppText variant="label" color="textSecondary">
            من إعلاناتي
          </AppText>
          {listings.map((l) => (
            <Stack key={l.id} gap="sm">
              <AppText variant="caption" color="textMuted" numberOfLines={1}>
                {l.title}
              </AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
                {l.images.map((url) => (
                  <Pressable
                    key={url}
                    disabled={busy || uploading}
                    onPress={() => onPick({ imageUrl: url, listingId: l.id })}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`صورة من ${l.title}`}
                  >
                    <View style={styles.thumb}>
                      <Image source={uriSource(url)} style={styles.thumbImg} contentFit="cover" />
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </Stack>
          ))}
        </Stack>
      )}
    </CouncilSheet>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loading: { paddingVertical: spacing.xl },
    empty: { paddingVertical: spacing.xl },
    thumbs: { gap: spacing.sm },
    thumb: {
      width: THUMB,
      height: THUMB,
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    thumbImg: { width: THUMB, height: THUMB },
  });
}
