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
  COUNCIL_STAGE_IMAGES_MAX,
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
  /** Golden stage: pick several images (shown as a gallery the host steps through). */
  multi?: boolean;
  onPickMany?: (picks: CouncilImagePick[]) => void;
  onClose: () => void;
};

const THUMB = 76;

/** «عرض صورة» picker: a photo from one of my listings, or one from the gallery. */
export function CouncilImagePickerSheet({ visible, busy, onPick, multi, onPickMany, onClose }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const [sources, setSources] = useState<CouncilImageSources | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<CouncilImagePick[]>([]);

  const toggle = (pick: CouncilImagePick) =>
    setSelected((list) =>
      list.some((p) => p.imageUrl === pick.imageUrl)
        ? list.filter((p) => p.imageUrl !== pick.imageUrl)
        : list.length >= COUNCIL_STAGE_IMAGES_MAX
          ? list
          : [...list, pick],
    );
  const choose = (pick: CouncilImagePick) => (multi ? toggle(pick) : onPick(pick));
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
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsMultipleSelection: Boolean(multi),
        selectionLimit: multi ? COUNCIL_STAGE_IMAGES_MAX - selected.length : 1,
      });
      if (result.canceled || !result.assets[0]) return;
      const token = getAccessToken();
      if (!token) return;
      setUploading(true);
      const url = await uploadImageFromUri(token, result.assets[0].uri, 'posts');
      if (!multi) {
        onPick({ imageUrl: url, listingId: null });
        return;
      }
      const uploaded: CouncilImagePick[] = [{ imageUrl: url, listingId: null }];
      for (const asset of result.assets.slice(1)) {
        uploaded.push({ imageUrl: await uploadImageFromUri(token, asset.uri, 'posts'), listingId: null });
      }
      setSelected((list) => [...list, ...uploaded].slice(0, COUNCIL_STAGE_IMAGES_MAX));
    } catch (err) {
      void showToast(err instanceof Error && err.message ? err.message : 'تعذّر رفع الصورة', 'error');
    } finally {
      setUploading(false);
    }
  };

  const listings = sources?.listings ?? [];
  const selectedIndex = (url: string) => selected.findIndex((p) => p.imageUrl === url);
  const uploadedPicks = selected.filter((p) => !p.listingId);
  return (
    <CouncilSheet
      visible={visible}
      title={COUNCIL_SHOW_IMAGE_LABEL}
      subtitle={
        multi
          ? `اختر حتى ${COUNCIL_STAGE_IMAGES_MAX} صور وتتحكم أنت بالتنقل بينها`
          : 'تظهر الصورة لجميع الحاضرين أعلى المجلس'
      }
      onClose={() => {
        setSelected([]);
        onClose();
      }}
      footer={
        <Stack gap="sm">
          {multi ? (
            <SarhButton
              title={selected.length > 0 ? `عرض المحدد (${selected.length})` : 'اختر صوراً للعرض'}
              shape="pill"
              fullWidth
              loading={busy}
              disabled={selected.length === 0 || uploading || busy}
              onPress={() => {
                onPickMany?.(selected);
                setSelected([]);
              }}
            />
          ) : null}
          <SarhButton
            title="اختيار من المعرض"
            leftIcon="image-outline"
            variant="secondary"
            shape="pill"
            fullWidth
            loading={uploading || (!multi && busy)}
            disabled={uploading || busy || (multi && selected.length >= COUNCIL_STAGE_IMAGES_MAX)}
            onPress={() => void fromGallery()}
          />
        </Stack>
      }
    >
      {loading ? (
        <ActivityIndicator color={colors.textMuted} style={styles.loading} />
      ) : listings.length === 0 && selected.length === 0 ? (
        <AppText variant="bodySmall" color="textMuted" align="center" style={styles.empty}>
          لا توجد صور في إعلاناتك النشطة
        </AppText>
      ) : (
        <Stack gap="lg">
          {multi && uploadedPicks.length > 0 ? (
            <Stack gap="sm">
              <AppText variant="label" color="textSecondary">
                من المعرض
              </AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
                {uploadedPicks.map((p) => (
                  <Pressable key={p.imageUrl} onPress={() => toggle(p)} accessibilityRole="imagebutton">
                    <View style={[styles.thumb, styles.thumbOn]}>
                      <Image source={uriSource(p.imageUrl)} style={styles.thumbImg} contentFit="cover" />
                      <View style={styles.order}>
                        <AppText variant="micro" color="textPrimary">
                          {selectedIndex(p.imageUrl) + 1}
                        </AppText>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </Stack>
          ) : null}
          {listings.length > 0 ? (
          <AppText variant="label" color="textSecondary">
            من إعلاناتي
          </AppText>
          ) : null}
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
                    onPress={() => choose({ imageUrl: url, listingId: l.id })}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`صورة من ${l.title}`}
                  >
                    <View style={[styles.thumb, selectedIndex(url) >= 0 && styles.thumbOn]}>
                      <Image source={uriSource(url)} style={styles.thumbImg} contentFit="cover" />
                      {selectedIndex(url) >= 0 ? (
                        <View style={styles.order}>
                          <AppText variant="micro" color="textPrimary">
                            {selectedIndex(url) + 1}
                          </AppText>
                        </View>
                      ) : null}
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
    thumbOn: { borderWidth: 2, borderColor: colors.electric },
    order: {
      position: 'absolute',
      top: 4,
      start: 4,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
