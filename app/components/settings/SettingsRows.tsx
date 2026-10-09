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
import { AppText, SarhDivider, SarhSettingsSection } from '@/design-system/components';
import { motion, typography } from '@/design-system/tokens';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow, ltrInputText, rtlInputText } from '@/lib/rtl';

/**
 * Grouped-list building blocks for inner settings pages. Rows with icon /
 * value / chevron / switch / checkmark are `SarhSettingsRow`; these cover
 * the rest: inline text fields, centered action rows, status and notes.
 */

/** iOS inset-grouped section (rounded card, grey header and footnote). */
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
    <SarhSettingsSection grouped title={title} footer={footer}>
      {children}
    </SarhSettingsSection>
  );
}

const styles = StyleSheet.create({
  fieldRow: {
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    gap: 12,
  },
  fieldLabel: { width: 96 },
  fieldInput: { flex: 1, minWidth: 0, paddingVertical: 12 },
  fieldPrefix: { writingDirection: 'ltr' },
  actionRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  status: { paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center', gap: 10 },
  checkLine: { alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
});

export type SettingsFieldRowProps = Omit<TextInputProps, 'style'> & {
  /** Fixed-width label on the start side (iOS «Label   value» field). Omit for a full-width field. */
  label?: string;
  /** Latin / numeric typing (email, phone, password, code). */
  ltr?: boolean;
  /** Static text before the input (e.g. «+966»). */
  prefix?: string;
  /** Eye toggle for password fields. */
  revealable?: boolean;
  showDivider?: boolean;
};

/** One editable row inside a grouped section: label · inline input. */
export const SettingsFieldRow = forwardRef<TextInput, SettingsFieldRowProps>(function SettingsFieldRow(
  { label, ltr = false, prefix, revealable = false, secureTextEntry, showDivider = false, editable = true, ...input },
  ref,
) {
  const { colors, isDark } = useTheme();
  const [revealed, setRevealed] = useState(false);
  return (
    <View>
      <View style={[styles.fieldRow, getRtlRow(), { opacity: editable ? 1 : motion.opacity.disabled }]}>
        {label ? (
          <AppText variant="label" color="textPrimary" numberOfLines={1} style={styles.fieldLabel}>
            {label}
          </AppText>
        ) : null}
        {prefix ? (
          <AppText variant="body" color="textMuted" style={styles.fieldPrefix}>
            {prefix}
          </AppText>
        ) : null}
        <TextInput
          ref={ref}
          {...input}
          editable={editable}
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
      {showDivider ? <SarhDivider inset /> : null}
    </View>
  );
});

/** Centered text action inside a group (iOS «Sign Out» style). */
export function SettingsActionRow({
  title,
  onPress,
  tone = 'default',
  loading = false,
  disabled = false,
  icon,
  showDivider = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
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
          { opacity: disabled ? motion.opacity.disabled : pressed ? motion.opacity.pressed : 1 },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={tint} />
        ) : (
          <>
            {icon ? <AppIcon name={icon} size={18} color={tint} /> : null}
            <AppText variant="label" style={{ color: tint }} numberOfLines={1}>
              {title}
            </AppText>
          </>
        )}
      </Pressable>
      {showDivider ? <SarhDivider inset /> : null}
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
            <>
              <SarhDivider />
              <SettingsActionRow title="إعادة المحاولة" onPress={onRetry} />
            </>
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
