import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { AppText, SarhBackButton } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { motion } from '@/design-system/tokens';
import { controls, layout } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/hooks/useTheme';
import { presentActionSheet } from '@/lib/actionSheet';
import { getRtlRow } from '@/lib/rtl';
import { showToast } from '@/lib/toast';

/**
 * Inner settings pages share one shell (iOS Settings):
 *
 *   ┌──────────────────────────────────────┐
 *   │ حفظ          العنوان              → │   back on the right (RTL), title centered,
 *   └──────────────────────────────────────┘   the text action (حفظ) at the top-left.
 *     العنوان الكبير                          large title on list pages, fades into the bar.
 *     ╭ grouped rounded sections ╮
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
  save?: SettingsSaveAction;
  onBack?: () => void;
  /** 0 → 1: compact title (and bar hairline) fade in as the large title scrolls away. */
  progress?: Animated.Value | Animated.AnimatedInterpolation<number>;
  showTitle?: boolean;
};

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    minHeight: layout.headerHeight - 8,
  },
  side: {
    minWidth: controls.iconButton + 24,
    justifyContent: 'center',
  },
  sideEnd: {
    alignItems: 'flex-end',
  },
  titleWrap: { flex: 1, minWidth: 0, alignItems: 'center' },
  title: { width: '100%', textAlign: 'center', writingDirection: 'rtl' },
  action: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hairline: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  largeTitle: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 },
});

/** Top bar for inner settings pages: back (right) · centered title · «حفظ» (left). */
export function SettingsSaveHeader({ title, save, onBack, progress, showTitle = true }: SettingsSaveHeaderProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { gutter } = useLayout();
  const saving = !!save?.saving;
  const enabled = !!save?.enabled && !saving;
  const label = save?.label ?? 'حفظ';

  return (
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
      <Animated.View style={[styles.titleWrap, { opacity: showTitle ? progress ?? 1 : 0 }]}>
        <AppText variant="heading3" color="textPrimary" numberOfLines={1} style={styles.title}>
          {title}
        </AppText>
      </Animated.View>
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
      <Animated.View
        pointerEvents="none"
        style={[styles.hairline, { backgroundColor: colors.borderSoft, opacity: progress ?? 0 }]}
      />
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
  /** iOS large title under the bar (list pages). Edit forms keep the compact title only. */
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

const LARGE_TITLE_FADE = [18, 44] as const;

/** Shell for every inner settings page: header + large title + grouped body. */
export function SettingsScreen({
  title,
  largeTitle = false,
  save,
  onBack,
  keyboard = false,
  width = 'content',
  refreshControl,
  children,
  testID,
}: SettingsScreenProps) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const progress = largeTitle
    ? scrollY.interpolate({ inputRange: [...LARGE_TITLE_FADE], outputRange: [0, 1], extrapolate: 'clamp' })
    : scrollY.interpolate({ inputRange: [0, 12], outputRange: [0, 1], extrapolate: 'clamp' });
  const largeOpacity = scrollY.interpolate({
    inputRange: [0, LARGE_TITLE_FADE[1] - 8],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.setValue(event.nativeEvent.contentOffset.y);
    },
    [scrollY],
  );

  return (
    <Screen edges={['top', 'bottom']} keyboard={keyboard} testID={testID}>
      <SettingsSaveHeader
        title={title}
        save={save}
        onBack={onBack}
        progress={largeTitle ? progress : undefined}
      />
      <ScreenBody
        gutter={false}
        width={width}
        padBottom="xxxl"
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={refreshControl}
      >
        {largeTitle ? (
          <Animated.View style={[styles.largeTitle, { opacity: largeOpacity }]}>
            <AppText variant="heading1" color="textPrimary" numberOfLines={1} accessibilityRole="header">
              {title}
            </AppText>
          </Animated.View>
        ) : null}
        {children}
      </ScreenBody>
    </Screen>
  );
}

export default SettingsScreen;
