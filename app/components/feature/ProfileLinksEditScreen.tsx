/**
 * Own profile: add / edit / remove profile links (up to 3, URL + optional label).
 * Saved through updateMe → PUT /api/users/:id `{ links }`; the server re-validates.
 */
import { AppText, SarhBackButton, SarhCard, SarhInput } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { useAppUser } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { showToast } from '@/lib/toast';
import { spacing, type ThemeColors } from '@/constants/theme';
import {
  MAX_PROFILE_LINKS,
  MAX_PROFILE_LINK_LABEL,
  sameProfileLinks,
  validateProfileLinkDrafts,
  type ProfileLinkDraft,
} from '@/lib/profileLinks';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet } from 'react-native';

export function ProfileLinksEditScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const { me, updateMe } = useAppUser();
  const initialLinks = useMemo(() => me.links ?? [], [me.links]);
  const [drafts, setDrafts] = useState<ProfileLinkDraft[]>(() => {
    const rows = initialLinks.map((l) => ({ url: l.url, label: l.label ?? '' }));
    return rows.length ? rows : [{ url: '', label: '' }];
  });
  const [error, setError] = useState<{ index: number; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (index: number, patch: Partial<ProfileLinkDraft>) => {
    setError(null);
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const remove = (index: number) => {
    setError(null);
    setDrafts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [{ url: '', label: '' }];
    });
  };

  const add = () => {
    if (drafts.length >= MAX_PROFILE_LINKS) return;
    setDrafts((prev) => [...prev, { url: '', label: '' }]);
  };

  const handleBack = () => {
    Keyboard.dismiss();
    router.back();
  };

  const handleSave = async () => {
    const checked = validateProfileLinkDrafts(drafts);
    if (!checked.ok) {
      setError({ index: checked.index, message: checked.error });
      void showToast(checked.error, 'warning');
      return;
    }
    if (sameProfileLinks(checked.links, initialLinks)) {
      handleBack();
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    const result = await updateMe({ links: checked.links });
    setSaving(false);
    if (result.ok) {
      void showToast(result.error || 'تم حفظ الروابط', result.error ? 'warning' : 'success');
      router.back();
      return;
    }
    void showToast(result.error || 'فشل حفظ التغييرات، يرجى المحاولة مجدداً.', 'error');
  };

  return (
    <Screen edges={['top']} keyboard>
      <Row justify="between" align="center" style={styles.header}>
        <SarhBackButton onPress={handleBack} color={colors.textPrimary} accessibilityLabel="رجوع" />
        <Pressable
          onPress={() => void handleSave()}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="حفظ"
          accessibilityState={{ disabled: saving, busy: saving }}
          hitSlop={12}
          style={styles.saveBtn}
          testID="profile-links-save"
        >
          {saving ? (
            <ActivityIndicator color={colors.electricBright} />
          ) : (
            <AppText variant="button" color="primary">
              حفظ
            </AppText>
          )}
        </Pressable>
      </Row>
      <ScreenBody padTop="lg" gap="md" width="form">
        <Stack gap="xs">
          <AppText variant="label" color="textSecondary">
            روابط
          </AppText>
          <AppText variant="meta" color="textMuted">
            تظهر تحت النبذة في ملفك الشخصي، حتى {MAX_PROFILE_LINKS} روابط.
          </AppText>
        </Stack>

        {drafts.map((draft, index) => (
          <SarhCard key={index} variant="default" padding="none" style={styles.card}>
            <Stack gap="sm" style={styles.cardBody}>
              <SarhInput
                appearance="theme"
                value={draft.url}
                onChangeText={(url) => update(index, { url })}
                placeholder="https://example.com"
                ltr
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textContentType="URL"
                inputMode="url"
                icon="link"
                maxLength={200}
                accessibilityLabel={`الرابط ${index + 1}`}
                errorText={error?.index === index ? error.message : undefined}
                testID={`profile-link-url-${index}`}
              />
              <SarhInput
                appearance="theme"
                value={draft.label}
                onChangeText={(label) => update(index, { label })}
                placeholder="اسم الرابط (اختياري)"
                maxLength={MAX_PROFILE_LINK_LABEL}
                accessibilityLabel={`اسم الرابط ${index + 1}`}
                testID={`profile-link-label-${index}`}
              />
              {draft.url || draft.label || drafts.length > 1 ? (
                <Pressable
                  onPress={() => remove(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`حذف الرابط ${index + 1}`}
                  hitSlop={8}
                  style={({ pressed }) => [styles.removeBtn, pressed ? styles.pressed : null]}
                  testID={`profile-link-remove-${index}`}
                >
                  <Row gap="xs" align="center">
                    <AppIcon name="trash-outline" size={15} color={colors.danger} />
                    <AppText variant="meta" color="danger">
                      حذف الرابط
                    </AppText>
                  </Row>
                </Pressable>
              ) : null}
            </Stack>
          </SarhCard>
        ))}

        {drafts.length < MAX_PROFILE_LINKS ? (
          <Pressable
            onPress={add}
            accessibilityRole="button"
            accessibilityLabel="إضافة رابط"
            style={({ pressed }) => [styles.addBtn, pressed ? styles.pressed : null]}
            testID="profile-link-add"
          >
            <Row gap="xs" align="center" justify="center">
              <AppIcon name="add" size={16} color={colors.textPrimary} />
              <AppText variant="label" color="textPrimary">
                إضافة رابط
              </AppText>
            </Row>
          </Pressable>
        ) : null}
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      minHeight: 52,
      paddingHorizontal: spacing.lg,
    },
    saveBtn: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: {
      overflow: 'hidden',
    },
    cardBody: {
      padding: spacing.md,
    },
    removeBtn: {
      alignSelf: 'flex-start',
      minHeight: 32,
      justifyContent: 'center',
    },
    addBtn: {
      minHeight: 44,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.6,
    },
  });
}
