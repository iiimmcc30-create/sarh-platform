import { forwardRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText, SarhSettingsSection } from '@/design-system/components';
import { motion, typography } from '@/design-system/tokens';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow, ltrInputText, rtlInputText } from '@/lib/rtl';

/**
 * X-style building blocks for settings pages. Rows with icon / description /
 * switch / checkmark are `SarhSettingsRow`; these cover the rest: underlined
 * text fields, text action rows, status and notes. Everything sits on the page
 * background — no cards, no boxes, no separators.
 */

/** A section: optional bold text sub-header, plain rows, grey note. */
export function SettingsGroup({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  return (
    <SarhSettingsSection title={title} footer={footer}>
      {children}
    </SarhSettingsSection>
  );
}

const styles = StyleSheet.create({
  field: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  fieldRow: {
    alignItems: 'center',
    minHeight: 44,
    gap: 8,
  },
  fieldInput: { flex: 1, minWidth: 0, paddingVertical: 8 },
  fieldPrefix: { writingDirection: 'ltr' },
  actionRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 12,
  },
  status: { paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center', gap: 10 },
  checkLine: { alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
});

export type SettingsFieldRowProps = Omit<TextInputProps, 'style'> & {
  /** Small grey label above the underlined input (X form field). */
  label?: string;
  /** Latin / numeric typing (email, phone, password, code). */
  ltr?: boolean;
  /** Static text before the input (e.g. «+966»). */
  prefix?: string;
  /** Eye toggle for password fields. */
  revealable?: boolean;
  /** @deprecated Every X field has its own underline; kept for compatibility, ignored. */
  showDivider?: boolean;
};

/** X form field: grey label, plain input, hairline underline that brightens on focus. */
export const SettingsFieldRow = forwardRef<TextInput, SettingsFieldRowProps>(function SettingsFieldRow(
  { label, ltr = false, prefix, revealable = false, secureTextEntry, editable = true, onFocus, onBlur, ...input },
  ref,
) {
  const { colors, isDark } = useTheme();
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, { opacity: editable ? 1 : motion.opacity.disabled }]}>
      {label ? (
        <AppText variant="caption" color={focused ? 'textPrimary' : 'textMuted'} numberOfLines={1}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.fieldRow,
          getRtlRow(),
          {
            borderBottomWidth: focused ? 2 * StyleSheet.hairlineWidth + 0.5 : StyleSheet.hairlineWidth,
            borderBottomColor: focused ? colors.textPrimary : colors.borderMid,
          },
        ]}
      >
        {prefix ? (
          <AppText variant="body" color="textMuted" style={styles.fieldPrefix}>
            {prefix}
          </AppText>
        ) : null}
        <TextInput
          ref={ref}
          {...input}
          editable={editable}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          secureTextEntry={revealable ? secureTextEntry && !revealed : secureTextEntry}
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          selectionColor={colors.electric}
          accessibilityLabel={input.accessibilityLabel ?? label ?? input.placeholder}
          style={[
            ltr ? ltrInputText : rtlInputText,
            styles.fieldInput,
            {
              fontFamily: typography.body.fontFamily,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
              fontWeight: typography.body.fontWeight,
              color: colors.textPrimary,
            },
          ]}
        />
        {revealable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            hitSlop={10}
            onPress={() => setRevealed((v) => !v)}
          >
            <AppIcon name={revealed ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

/** Plain text action row (X «تسجيل الخروج»): start-aligned, optional icon, no box. */
export function SettingsActionRow({
  title,
  onPress,
  tone = 'default',
  loading = false,
  disabled = false,
  icon,
  testID,
}: {
  title: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  /** @deprecated No separators in X lists; ignored. */
  showDivider?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const tint = tone === 'danger' ? colors.danger : colors.textPrimary;
  const off = disabled || loading;
  return (
    <View>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: off, busy: loading }}
        disabled={off}
        onPress={onPress}
        style={({ pressed }) => [
          styles.actionRow,
          getRtlRow(),
          {
            opacity: disabled ? motion.opacity.disabled : 1,
            backgroundColor: pressed ? colors.bgElevated : 'transparent',
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={tint} />
        ) : (
          <>
            {icon ? <AppIcon name={icon} size={22} strokeWidth={1.5} color={tint} /> : null}
            <AppText variant="label" style={{ color: tint }} numberOfLines={1}>
              {title}
            </AppText>
          </>
        )}
      </Pressable>
    </View>
  );
}

/** Loading / error / empty state, drawn inside a group so the page keeps its shape. */
export function SettingsStatus({
  state,
  message,
  icon,
  onRetry,
}: {
  state: 'loading' | 'error' | 'empty';
  message?: string;
  icon?: string;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <SettingsGroup>
      {state === 'loading' ? (
        <View style={styles.status}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      ) : (
        <>
          <View style={styles.status}>
            {icon ? <AppIcon name={icon} size={28} color={colors.textMuted} /> : null}
            <AppText variant="bodySmall" color="textMuted" align="center">
              {message}
            </AppText>
          </View>
          {state === 'error' && onRetry ? (
            <View style={{ alignItems: 'center' }}>
              <SettingsActionRow title="إعادة المحاولة" onPress={onRetry} />
            </View>
          ) : null}
        </>
      )}
    </SettingsGroup>
  );
}

/** Live requirement line (password rules): filled check when met. */
export function SettingsCheckLine({ label, met }: { label: string; met: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.checkLine, getRtlRow()]}>
      <AppIcon
        name="checkmark"
        size={16}
        strokeWidth={met ? 2.6 : 1.6}
        color={met ? colors.textPrimary : colors.textMuted}
      />
      <AppText variant="bodySmall" color={met ? 'textPrimary' : 'textMuted'}>
        {label}
      </AppText>
    </View>
  );
}

export type SettingsPillTone = 'neutral' | 'success' | 'warning' | 'danger';

/** Small status capsule (payments, devices): tinted text + hairline, no fill colour. */
export function SettingsPill({ label, tone = 'neutral' }: { label: string; tone?: SettingsPillTone }) {
  const { colors } = useTheme();
  const tint =
    tone === 'success'
      ? colors.success
      : tone === 'warning'
        ? colors.warning
        : tone === 'danger'
          ? colors.danger
          : colors.textSecondary;
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: tone === 'neutral' ? colors.borderMid : tint,
        alignSelf: 'center',
      }}
    >
      <AppText variant="micro" style={{ color: tint }} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

/** Intro block at the top of a page (X): plain outline icon, bold title, grey explanation. */
export function SettingsHero({ icon, title, body }: { icon: string; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 24, paddingBottom: 8, gap: 8 }}>
      <AppIcon name={icon} size={36} strokeWidth={1.5} color={colors.textPrimary} />
      <AppText variant="heading3" color="textPrimary" align="center">
        {title}
      </AppText>
      <AppText variant="bodySmall" color="textMuted" align="center">
        {body}
      </AppText>
    </View>
  );
}
