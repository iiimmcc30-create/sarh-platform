import { AppText, SarhBackButton, SarhInput } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useAppUser } from '@/hooks/useApp';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { profileNameHint, profileUsernameHint } from '@/lib/profileChangeCooldown';
import { showToast } from '@/lib/toast';
import { type ThemeColors } from '@/constants/theme';
import { spacing } from '@/constants/theme';
import { createRequestGeneration } from '@/services/requestCoordination';
import { checkUsernameAvailable } from '@/services/users';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet } from 'react-native';
import type { User } from '@/services/types';

export type ProfileEditField = 'name' | 'username' | 'bio';

type FieldConfig = {
  title: string;
  placeholder: string;
  multiline?: boolean;
  maxLength?: number;
  ltr?: boolean;
  leadingAt?: boolean;
  transform?: (value: string) => string;
  read: (me: User) => string;
  validate: (value: string) => string | null;
  toUpdates: (value: string) => Partial<User>;
};

const FIELDS: Record<ProfileEditField, FieldConfig> = {
  name: {
    title: 'الاسم',
    placeholder: 'اسمك الكامل',
    read: (me) => me.arabicName || me.displayName || '',
    validate: (value) => (value.trim() ? null : 'يرجى ملء جميع الحقول المطلوبة'),
    toUpdates: (value) => {
      const name = value.trim();
      return { displayName: name, arabicName: name };
    },
  },
  username: {
    title: 'اسم المستخدم',
    placeholder: 'اسم_المستخدم',
    ltr: true,
    leadingAt: true,
    transform: (value) => value.replace(/\s/g, '').toLowerCase(),
    read: (me) => me.username || '',
    validate: (value) => (value.trim() ? null : 'يرجى ملء جميع الحقول المطلوبة'),
    toUpdates: (value) => ({ username: value.trim() }),
  },
  bio: {
    title: 'السيرة الذاتية',
    placeholder: 'أخبرنا عن نفسك...',
    multiline: true,
    maxLength: 160,
    read: (me) => me.bio || '',
    validate: () => null,
    toUpdates: (value) => ({ bio: value }),
  },
};

export function isProfileEditField(value: string | undefined): value is ProfileEditField {
  return value === 'name' || value === 'username' || value === 'bio';
}

type Props = {
  field: ProfileEditField;
};

export function ProfileFieldEditScreen({ field }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const { me, updateMe } = useAppUser();
  const config = FIELDS[field];
  const initial = useMemo(() => config.read(me), [config, me]);
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [usernameAvailability, setUsernameAvailability] = useState<
    'idle' | 'available' | 'taken'
  >('idle');
  const availabilityGeneration = useRef(createRequestGeneration());
  const debouncedUsername = useDebouncedValue(field === 'username' ? value : '', 350);

  const nameCooldownAt = field === 'name' ? me.nameNextAllowedAt : null;
  const usernameCooldownAt = field === 'username' ? me.usernameNextAllowedAt : null;
  const cooldownActive = Boolean(nameCooldownAt || usernameCooldownAt);
  const usernameTaken =
    field === 'username' && usernameAvailability === 'taken' && value !== initial;
  const saveBlocked = cooldownActive || usernameTaken;

  useEffect(() => {
    if (field !== 'username') return;
    if (!debouncedUsername || debouncedUsername === initial) {
      setUsernameAvailability('idle');
      return;
    }
    const token = availabilityGeneration.current.next();
    void checkUsernameAvailable(debouncedUsername)
      .then((available) => {
        if (!availabilityGeneration.current.isCurrent(token)) return;
        if (available === true) setUsernameAvailability('available');
        else if (available === false) setUsernameAvailability('taken');
        else setUsernameAvailability('idle');
      })
      .catch(() => {
        if (availabilityGeneration.current.isCurrent(token)) {
          setUsernameAvailability('idle');
        }
      });
  }, [debouncedUsername, field, initial]);

  const onChangeText = (next: string) => {
    setValue(config.transform ? config.transform(next) : next);
  };

  const handleBack = () => {
    Keyboard.dismiss();
    router.back();
  };

  const handleSave = async () => {
    if (saveBlocked) return;
    const error = config.validate(value);
    if (error) {
      void showToast(error, 'warning');
      return;
    }
    if (value === initial) {
      handleBack();
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    const result = await updateMe(config.toUpdates(value));
    setSaving(false);
    if (result.ok) {
      if (result.error) {
        void showToast(result.error, 'warning');
      } else {
        void showToast('تم حفظ التغييرات بنجاح', 'success');
      }
      router.back();
      return;
    }
    void showToast(result.error || 'فشل حفظ التغييرات، يرجى المحاولة مجدداً.', 'error');
  };

  const hint =
    field === 'name'
      ? profileNameHint(nameCooldownAt)
      : field === 'username'
        ? profileUsernameHint(usernameCooldownAt)
        : null;

  return (
    <Screen edges={['top']} keyboard>
      <Row justify="between" align="center" style={styles.header}>
        <SarhBackButton onPress={handleBack} color={colors.textPrimary} accessibilityLabel="رجوع" />
        <Pressable
          onPress={() => void handleSave()}
          disabled={saving || saveBlocked}
          accessibilityRole="button"
          accessibilityLabel="حفظ"
          accessibilityState={{ disabled: saving || saveBlocked, busy: saving }}
          hitSlop={12}
          style={styles.saveBtn}
        >
          {saving ? (
            <ActivityIndicator color={colors.electricBright} />
          ) : (
            <AppText variant="button" color={saveBlocked ? 'textMuted' : 'primary'}>
              حفظ
            </AppText>
          )}
        </Pressable>
      </Row>
      <ScreenBody padTop="lg" gap="sm" width="form">
        <Stack gap="sm">
          <AppText variant="label" color="textSecondary">
            {config.title}
          </AppText>
          {hint ? (
            <AppText variant="meta" color="textMuted">
              {hint}
            </AppText>
          ) : null}
          <SarhInput
            appearance="theme"
            value={value}
            onChangeText={onChangeText}
            placeholder={config.placeholder}
            autoFocus
            autoCapitalize={config.ltr ? 'none' : 'words'}
            autoCorrect={!config.ltr}
            ltr={config.ltr}
            multiline={config.multiline}
            numberOfLines={config.multiline ? 5 : 1}
            maxLength={config.maxLength}
            leadingIcon={
              config.leadingAt ? (
                <AppText variant="body" color="textMuted">
                  @
                </AppText>
              ) : undefined
            }
            style={config.multiline ? styles.bioInput : undefined}
          />
          {field === 'username' && usernameAvailability === 'available' ? (
            <AppText variant="meta" color="success">
              اسم المستخدم متاح
            </AppText>
          ) : null}
          {field === 'username' && usernameAvailability === 'taken' ? (
            <AppText variant="meta" color="danger">
              اسم المستخدم محجوز
            </AppText>
          ) : null}
          {config.maxLength ? (
            <AppText variant="meta" color="textMuted">
              {value.length}/{config.maxLength}
            </AppText>
          ) : null}
        </Stack>
      </ScreenBody>
    </Screen>
  );
}

function createStyles(_colors: ThemeColors) {
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
    bioInput: {
      minHeight: 140,
      textAlignVertical: 'top',
    },
  });
}
