import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, SarhButton, SarhInput } from '@/design-system/components';
import { BottomAction, Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { safeReplace } from '@/lib/safeNavigate';
import { showToast } from '@/lib/toast';
import {
  COLLECTION_DESCRIPTION_MAX,
  COLLECTION_TYPE_LABELS,
  createCollection,
  isValidCollectionName,
  updateCollection,
  uploadCollectionCover,
  type CollectionType,
} from '@/services/collections';
import { needsUpload } from '@/services/mediaUri';
import { resolveMediaUrl } from '@/services/media';

type Mode = 'create' | 'edit';

const TYPES: CollectionType[] = ['POSTS', 'ADS'];

export default function CollectionFormScreen() {
  const router = useRouter();
  const { accessToken, isAuthenticated } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    description?: string;
    coverUrl?: string;
    type?: string;
  }>();

  const editId = typeof params.id === 'string' ? params.id : '';
  const mode: Mode = editId ? 'edit' : 'create';

  const [name, setName] = useState(
    typeof params.name === 'string' ? params.name : '',
  );
  const [description, setDescription] = useState(
    typeof params.description === 'string' ? params.description : '',
  );
  const [coverLocal, setCoverLocal] = useState<string | null>(null);
  const [coverRemote] = useState<string | null>(
    typeof params.coverUrl === 'string' && params.coverUrl ? params.coverUrl : null,
  );
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [type, setType] = useState<CollectionType>(
    params.type === 'ADS' ? 'ADS' : 'POSTS',
  );
  const [submitting, setSubmitting] = useState(false);

  const coverPreview = coverLocal
    ? coverLocal
    : coverRemoved
      ? null
      : resolveMediaUrl(coverRemote) ?? null;

  const canSubmit = isValidCollectionName(name) && !submitting && isAuthenticated;

  const pickCover = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('إذن مطلوب', 'يرجى السماح للتطبيق بالوصول إلى مكتبة الصور');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setCoverLocal(result.assets[0].uri);
    setCoverRemoved(false);
  }, []);

  const clearCover = useCallback(() => {
    setCoverLocal(null);
    setCoverRemoved(true);
  }, []);

  const title = mode === 'edit' ? 'تعديل المجموعة' : 'أنشئ مجموعتك';
  const submitLabel = mode === 'edit' ? 'حفظ التعديلات' : 'إنشاء المجموعة';

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      let coverUrl: string | null | undefined = undefined;
      if (coverLocal && needsUpload(coverLocal)) {
        coverUrl = await uploadCollectionCover(coverLocal, accessToken);
      } else if (coverRemoved) {
        coverUrl = null;
      } else if (mode === 'create' && coverRemote) {
        coverUrl = coverRemote;
      }

      if (mode === 'edit') {
        await updateCollection(editId, {
          name: name.trim(),
          description: description.trim(),
          ...(coverUrl !== undefined ? { coverUrl } : {}),
          type,
        });
        void showToast('تم حفظ التعديلات', 'success');
        router.back();
        return;
      }

      const created = await createCollection({
        name: name.trim(),
        description: description.trim() || undefined,
        coverUrl: coverUrl || undefined,
        type,
      });
      void showToast('تم إنشاء المجموعة', 'success');
      safeReplace(
        {
          pathname: '/collections/[id]/members',
          params: { id: created.id, setup: '1' },
        },
        undefined,
        router,
      );
    } catch (err) {
      void showToast(
        err instanceof Error ? err.message : 'تعذّر حفظ المجموعة',
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    accessToken,
    canSubmit,
    coverLocal,
    coverRemote,
    coverRemoved,
    description,
    editId,
    mode,
    name,
    router,
    type,
  ]);

  const typeControl = useMemo(
    () => (
      <Row gap="sm" style={styles.segment}>
        {TYPES.map((value) => {
          const active = type === value;
          return (
            <Pressable
              key={value}
              onPress={() => setType(value)}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={COLLECTION_TYPE_LABELS[value]}
            >
              <AppText
                variant="label"
                color={active ? 'textPrimary' : 'textMuted'}
                align="center"
              >
                {COLLECTION_TYPE_LABELS[value]}
              </AppText>
            </Pressable>
          );
        })}
      </Row>
    ),
    [styles, type],
  );

  return (
    <Screen edges={['top', 'bottom']} keyboard>
      <ScreenHeader variant="screen" title={title} showBack />
      <ScreenBody bottomInset="action" gap="lg">
        <Stack gap="sm">
          <Pressable
            onPress={pickCover}
            style={styles.coverArea}
            accessibilityRole="button"
            accessibilityLabel="اختيار صورة الغلاف"
          >
            {coverPreview ? (
              <Image source={{ uri: coverPreview }} style={styles.coverImage} />
            ) : (
              <Stack gap="sm" align="center">
                <AppIcon name="image-outline" size={28} color={colors.textMuted} />
                <AppText variant="label" color="textMuted">
                  اختيار صورة
                </AppText>
              </Stack>
            )}
          </Pressable>
          {coverPreview ? (
            <Row gap="sm" justify="end">
              <SarhButton
                title="استبدال"
                variant="secondary"
                size="sm"
                shape="pill"
                onPress={pickCover}
              />
              <SarhButton
                title="إزالة"
                variant="ghost"
                size="sm"
                shape="pill"
                onPress={clearCover}
              />
            </Row>
          ) : null}
        </Stack>

        <SarhInput
          label="اسم المجموعة"
          value={name}
          onChangeText={setName}
          placeholder="أدخل اسم المجموعة"
          maxLength={60}
          appearance="theme"
        />
        <SarhInput
          label="وصف المجموعة"
          value={description}
          onChangeText={setDescription}
          placeholder="اكتب وصفًا مختصرًا للمجموعة"
          multiline
          maxLength={COLLECTION_DESCRIPTION_MAX}
          appearance="theme"
          style={styles.description}
        />

        <Stack gap="sm">
          <AppText variant="label" color="textPrimary">
            نوع المجموعة
          </AppText>
          {typeControl}
        </Stack>
      </ScreenBody>

      <BottomAction>
        <SarhButton
          title={submitLabel}
          onPress={() => void onSubmit()}
          disabled={!canSubmit}
          loading={submitting}
          fullWidth
          shape="pill"
        />
      </BottomAction>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    coverArea: {
      height: 160,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      backgroundColor: colors.bgField,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    coverImage: { width: '100%', height: '100%' },
    description: { minHeight: 96, textAlignVertical: 'top' },
    segment: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      borderRadius: radius.pill,
      padding: 3,
      backgroundColor: colors.bgField,
    },
    segmentBtn: {
      flex: 1,
      minHeight: 36,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    segmentBtnActive: {
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderMid,
    },
  });
}
