import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { AppText, SarhBackButton } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { motion } from '@/design-system/tokens';
import { controls, layout } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/hooks/useTheme';
import { useAppUser } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { presentActionSheet } from '@/lib/actionSheet';
import { getRtlRow } from '@/lib/rtl';
import { showToast } from '@/lib/toast';

/**
 * Settings pages share one X-style shell:
 *
 *   ┌──────────────────────────────────────┐
 *   │ حفظ                    الخصوصية   → │   back on the right (RTL), bold title with
 *   │                         @username    │   the @username in grey under it, the text
 *   └──────────────────────────────────────┘   action (حفظ) at the top-left, then a hairline.
 *     plain rows on the page background — no cards, no boxes, no separators.
 *
 * Edit pages pass `save`: the action is dim until something changes, shows a
 * spinner while saving, and leaving with unsaved edits asks first
 * (`useUnsavedChangesGuard`). Toggle pages auto-save and pass no `save`.
 */

export type SettingsSaveAction = {
  /** Defaults to «حفظ». Multi-step forms use «التالي» / «تأكيد». */
  label?: string;
  /** True once the form differs from what is saved (and is submittable). */
  enabled: boolean;
  saving?: boolean;
  onPress: () => void;
};

export type SettingsSaveHeaderProps = {
  title: string;
  /** Grey line under the title. Defaults to the signed-in @username; pass `null` to hide. */
  subtitle?: string | null;
  save?: SettingsSaveAction;
  onBack?: () => void;
  /** @deprecated The X header is always shown in full; kept for call-site compatibility. */
  progress?: Animated.Value | Animated.AnimatedInterpolation<number>;
  /** @deprecated See `progress`. */
  showTitle?: boolean;
};

/**
 * Display name + @username for the settings header and the «حسابك» page.
 * `me` (AppContext) starts as an empty placeholder until the profile loads, so
 * fall back to the signed-in auth user instead of rendering nothing.
 */
export function useSettingsIdentity(): { name: string; username: string } {
  const { me } = useAppUser();
  const { user } = useAuth();
  const username = (me.username || user?.username || '').replace(/^@/, '');
  const name =
    me.arabicName || me.displayName || user?.arabicName || user?.displayName || username || 'حسابي';
  return { name, username };
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    minHeight: layout.headerHeight,
    gap: 4,
  },
  side: {
    minWidth: controls.iconButton,
    justifyContent: 'center',
  },
  sideEnd: {
    minWidth: controls.iconButton + 24,
    alignItems: 'flex-end',
  },
  titleWrap: { flex: 1, minWidth: 0, alignItems: 'flex-start', justifyContent: 'center' },
  action: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
  },
});

/** X header for settings pages: back (right) · bold title + grey @username · «حفظ» (left) · hairline. */
export function SettingsSaveHeader({ title, subtitle, save, onBack }: SettingsSaveHeaderProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { gutter } = useLayout();
  const { username } = useSettingsIdentity();
  const saving = !!save?.saving;
  const enabled = !!save?.enabled && !saving;
  const label = save?.label ?? 'حفظ';
  const line = subtitle === undefined ? (username ? `@${username}` : null) : subtitle;

  return (
    <View>
      <View style={[styles.bar, getRtlRow(), { paddingHorizontal: gutter - 4 }]}>
        <View style={styles.side}>
          <SarhBackButton
            accessibilityLabel="رجوع"
            color={colors.textPrimary}
            onPress={() => {
              Keyboard.dismiss();
              if (onBack) onBack();
              else router.back();
            }}
          />
        </View>
        <View style={styles.titleWrap}>
          <AppText variant="heading3" color="textPrimary" numberOfLines={1} accessibilityRole="header">
            {title}
          </AppText>
          {line ? (
            <AppText
              testID="settings-header-username"
              variant="caption"
              color="textMuted"
              numberOfLines={1}
              style={{ writingDirection: 'ltr' }}
            >
              {line}
            </AppText>
          ) : null}
        </View>
        <View style={[styles.side, styles.sideEnd]}>
          {save ? (
            <Pressable
              testID="settings-save"
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ disabled: !enabled, busy: saving }}
              disabled={!enabled}
              onPress={() => {
                Keyboard.dismiss();
                save.onPress();
              }}
              hitSlop={12}
              style={({ pressed }) => [styles.action, { opacity: pressed ? motion.opacity.pressed : 1 }]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <AppText
                  variant="button"
                  color={enabled ? 'textPrimary' : 'textMuted'}
                  style={{ opacity: enabled ? 1 : motion.opacity.disabled }}
                >
                  {label}
                </AppText>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={[styles.hairline, { backgroundColor: colors.borderSoft }]} />
    </View>
  );
}

/**
 * Blocks back / swipe-back while there are unsaved edits and asks
 * «تجاهل التغييرات؟». `allowLeave()` lets the next navigation through
 * (call it right before going back after a successful save).
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const navigation = useNavigation();
  const bypass = useRef(false);

  usePreventRemove(dirty, ({ data }) => {
    if (bypass.current) {
      navigation.dispatch(data.action);
      return;
    }
    Keyboard.dismiss();
    void presentActionSheet({
      title: 'تجاهل التغييرات؟',
      message: 'لم تحفظ تعديلاتك بعد.',
      items: [
        { key: 'discard', label: 'تجاهل التغييرات', destructive: true },
        { key: 'cancel', label: 'متابعة التعديل', cancel: true },
      ],
    }).then((key) => {
      if (key === 'discard') {
        bypass.current = true;
        navigation.dispatch(data.action);
      }
    });
  });

  return useCallback(() => {
    bypass.current = true;
  }, []);
}

/**
 * Runs a save: spinner on the header action, then success feedback
 * (toast) and back. `run` resolves true when the save went through.
 */
export function useSettingsSave(allowLeave?: () => void) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const save = useCallback(
    async (run: () => Promise<boolean>, options?: { successMessage?: string; goBack?: boolean }) => {
      if (busy.current) return false;
      busy.current = true;
      Keyboard.dismiss();
      setSaving(true);
      let ok = false;
      try {
        ok = await run();
      } finally {
        busy.current = false;
        setSaving(false);
      }
      if (!ok) return false;
      void showToast(options?.successMessage ?? 'تم حفظ التغييرات', 'success');
      if (options?.goBack !== false) {
        allowLeave?.();
        if (router.canGoBack()) router.back();
      }
      return true;
    },
    [allowLeave, router],
  );

  return { saving, save };
}

export type SettingsScreenProps = {
  title: string;
  /** Grey line under the title; defaults to the signed-in @username. */
  subtitle?: string | null;
  /** @deprecated X pages show the title in the header only; kept for call-site compatibility. */
  largeTitle?: boolean;
  save?: SettingsSaveAction;
  onBack?: () => void;
  /** Form pages: keyboard avoidance + the responsive form width. */
  keyboard?: boolean;
  width?: 'content' | 'form';
  refreshControl?: React.ComponentProps<typeof ScreenBody>['refreshControl'];
  children: ReactNode;
  testID?: string;
};

/** Shell for every settings page: X header + plain body on the page background. */
export function SettingsScreen({
  title,
  subtitle,
  save,
  onBack,
  keyboard = false,
  width = 'content',
  refreshControl,
  children,
  testID,
}: SettingsScreenProps) {
  return (
    <Screen edges={['top', 'bottom']} keyboard={keyboard} testID={testID}>
      <SettingsSaveHeader title={title} subtitle={subtitle} save={save} onBack={onBack} />
      <ScreenBody gutter={false} width={width} padBottom="xxxl" refreshControl={refreshControl}>
        {children}
      </ScreenBody>
    </Screen>
  );
}

export default SettingsScreen;
