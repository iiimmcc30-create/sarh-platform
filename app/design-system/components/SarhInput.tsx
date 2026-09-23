import { memo, useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText as UiAppText } from '@/components/ui/AppText';
import { controls, radius as themeRadius, spacing, typography as themeTypography, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow, ltrInputText, marginStart, rtlInputText } from '@/lib/rtl';
import { motion, radius, space, typography } from '../tokens';
import { AppText } from './AppText';
import { type SarhInputState } from './resolvers';

export type SarhInputAppearance = 'foundation' | 'theme';
export type SarhInputShape = 'rounded' | 'pill';
export type SarhInputSize = 'md' | 'compact';

export type SarhInputProps = TextInputProps & {
  label?: string;
  helperText?: string;
  errorText?: string;
  leadingIcon?: ReactNode | string;
  trailingIcon?: ReactNode | string;
  onTrailingPress?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  shape?: SarhInputShape;
  /** `compact` matches the 40pt shell tools (avatar / bell). */
  size?: SarhInputSize;
  /** Live-theme field chrome (former AppTextInput). Default is foundation DS. */
  appearance?: SarhInputAppearance;
  /** Alias of errorText — AppTextInput API. */
  error?: string;
  /** Alias of helperText — AppTextInput API. */
  hint?: string;
  /** Alias of leadingIcon when a Flaticon name is passed. */
  icon?: string;
  /** Latin / numeric fields — uses ltrInputText. */
  ltr?: boolean;
};

export { resolveSarhInputBorder } from './resolvers';
export type { SarhInputState } from './resolvers';

function renderFieldIcon(icon: ReactNode | string | undefined, color: string) {
  if (!icon) return null;
  if (typeof icon === 'string') {
    return <AppIcon name={icon} size={typography.body.fontSize} color={color} />;
  }
  return icon;
}

function FoundationInput({
  label,
  helperText,
  errorText,
  leadingIcon,
  trailingIcon,
  onTrailingPress,
  containerStyle,
  shape = 'rounded',
  size = 'md',
  editable = true,
  secureTextEntry,
  onFocus,
  onBlur,
  placeholder,
  accessibilityLabel,
  style,
  ltr = false,
  ...rest
}: SarhInputProps) {
  const { colors: themeColors, isDark } = useTheme();
  const [focused, setFocused] = useState(false);
  const disabled = editable === false;
  const state: SarhInputState = disabled
    ? 'disabled'
    : errorText
      ? 'error'
      : focused
        ? 'focused'
        : 'default';
  const borderColor =
    state === 'error'
      ? themeColors.danger
      : state === 'focused'
        ? themeColors.electric
        : themeColors.borderSoft;
  const iconColor = state === 'error' ? themeColors.danger : themeColors.textMuted;
  const inputDir = ltr ? ltrInputText : rtlInputText;

  return (
    <View style={containerStyle}>
      {label ? (
        <AppText variant="label" color="textSecondary" style={{ marginBottom: space[8] }}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          getRtlRow(),
          {
            alignItems: 'center',
            minHeight: size === 'compact' ? space[40] : space[48],
            height: size === 'compact' ? space[40] : undefined,
            paddingHorizontal: space[12],
            gap: space[8],
            borderRadius: shape === 'pill' ? radius[999] : radius[12],
            borderWidth: state === 'focused' || state === 'error' ? 1 : StyleSheet.hairlineWidth,
            borderColor,
            backgroundColor: themeColors.bgField,
            opacity: disabled ? motion.opacity.disabled : 1,
          },
        ]}
      >
        {renderFieldIcon(leadingIcon, iconColor)}
        <TextInput
          {...rest}
          editable={!disabled}
          secureTextEntry={secureTextEntry}
          placeholder={placeholder}
          placeholderTextColor={themeColors.textMuted}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          selectionColor={themeColors.electric}
          accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
          accessibilityState={{ disabled }}
          style={[
            inputDir,
            {
              flex: 1,
              fontFamily: typography.body.fontFamily,
              fontSize: typography.body.fontSize,
              lineHeight: typography.body.lineHeight,
              fontWeight: typography.body.fontWeight,
              color: themeColors.textPrimary,
              paddingVertical: size === 'compact' ? 0 : space[12],
            },
            style,
          ]}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
        {trailingIcon ? (
          <Pressable
            onPress={onTrailingPress}
            disabled={!onTrailingPress || disabled}
            accessibilityRole={onTrailingPress ? 'button' : 'none'}
            hitSlop={space[8]}
          >
            {renderFieldIcon(trailingIcon, iconColor)}
          </Pressable>
        ) : null}
      </View>
      {errorText ? (
        <AppText variant="caption" color="danger" style={{ marginTop: space[4] }}>
          {errorText}
        </AppText>
      ) : null}
      {!errorText && helperText ? (
        <AppText variant="caption" color="textMuted" style={{ marginTop: space[4] }}>
          {helperText}
        </AppText>
      ) : null}
    </View>
  );
}

function ThemeInput({
  label,
  helperText,
  errorText,
  leadingIcon,
  containerStyle,
  ltr = false,
  style,
  placeholderTextColor,
  onFocus,
  onBlur,
  editable = true,
  ...props
}: SarhInputProps) {
  const { styles, colors: themeColors, isDark } = useThemedStyles((theme) => ({
    styles: createThemeStyles(theme.colors),
    colors: theme.colors,
    isDark: theme.scheme === 'dark',
  }));
  const inputStyle = ltr ? ltrInputText : rtlInputText;
  const focusedRef = useRef(false);
  const wrapRef = useRef<View>(null);
  const iconName = typeof leadingIcon === 'string' ? leadingIcon : undefined;

  const applyFocusVisual = useCallback(
    (focused: boolean) => {
      focusedRef.current = focused;
      wrapRef.current?.setNativeProps({
        style: focused
          ? {
              borderColor: themeColors.electric,
              borderWidth: 1.5,
              backgroundColor: themeColors.bgField,
            }
          : {
              borderColor: themeColors.borderSoft,
              borderWidth: StyleSheet.hairlineWidth,
              backgroundColor: themeColors.bgField,
            },
      });
    },
    [themeColors.bgField, themeColors.borderSoft, themeColors.electric],
  );

  const handleFocus = useCallback(
    (event: Parameters<NonNullable<TextInputProps['onFocus']>>[0]) => {
      applyFocusVisual(true);
      onFocus?.(event);
    },
    [applyFocusVisual, onFocus],
  );

  const handleBlur = useCallback(
    (event: Parameters<NonNullable<TextInputProps['onBlur']>>[0]) => {
      applyFocusVisual(false);
      onBlur?.(event);
    },
    [applyFocusVisual, onBlur],
  );

  return (
    <View style={containerStyle}>
      {label ? <UiAppText style={styles.label}>{label}</UiAppText> : null}
      <View
        ref={wrapRef}
        style={[styles.wrap, errorText ? styles.wrapError : null, !editable && styles.wrapDisabled]}
      >
        {iconName ? (
          <View style={styles.iconBubble}>
            <AppIcon name={iconName} size={18} color={themeColors.textMuted} />
          </View>
        ) : leadingIcon && typeof leadingIcon !== 'string' ? (
          leadingIcon
        ) : null}
        <TextInput
          placeholderTextColor={placeholderTextColor ?? themeColors.textSubtle}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          selectionColor={themeColors.electric}
          style={[styles.input, inputStyle, style]}
          editable={editable}
          onFocus={handleFocus}
          onBlur={handleBlur}
          accessibilityLabel={props.accessibilityLabel ?? label ?? props.placeholder}
          accessibilityState={{ disabled: editable === false }}
          {...props}
        />
      </View>
      {errorText ? <UiAppText style={styles.error}>{errorText}</UiAppText> : null}
      {!errorText && helperText ? <UiAppText style={styles.hint}>{helperText}</UiAppText> : null}
    </View>
  );
}

function createThemeStyles(themeColors: ThemeColors) {
  return StyleSheet.create({
    label: {
      ...themeTypography.smallHeading,
      color: themeColors.textSecondary,
      marginBottom: spacing.xs,
    },
    wrap: {
      ...getRtlRow(),
      alignItems: 'center',
      backgroundColor: themeColors.bgField,
      borderRadius: themeRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: themeColors.borderSoft,
      paddingHorizontal: spacing.sm,
      minHeight: controls.heightLg,
    },
    wrapError: {
      borderColor: themeColors.danger,
    },
    wrapDisabled: { opacity: 0.55 },
    iconBubble: {
      width: 34,
      height: 34,
      borderRadius: themeRadius.md,
      backgroundColor: themeColors.bgSurface,
      alignItems: 'center',
      justifyContent: 'center',
      ...marginStart(spacing.sm),
    },
    input: {
      flex: 1,
      ...themeTypography.body,
      color: themeColors.textPrimary,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.md,
    },
    error: {
      ...themeTypography.caption,
      color: themeColors.danger,
      marginTop: spacing.xs,
    },
    hint: {
      ...themeTypography.caption,
      color: themeColors.textMuted,
      marginTop: spacing.xs,
    },
  });
}

function SarhInputComponent({
  appearance = 'foundation',
  error,
  hint,
  icon,
  errorText,
  helperText,
  leadingIcon,
  ...rest
}: SarhInputProps) {
  const resolvedError = errorText ?? error;
  const resolvedHelper = helperText ?? hint;
  const resolvedLeading = leadingIcon ?? icon;

  if (appearance === 'theme') {
    return (
      <ThemeInput
        {...rest}
        errorText={resolvedError}
        helperText={resolvedHelper}
        leadingIcon={resolvedLeading}
      />
    );
  }

  return (
    <FoundationInput
      {...rest}
      errorText={resolvedError}
      helperText={resolvedHelper}
      leadingIcon={resolvedLeading}
    />
  );
}

export const SarhInput = memo(SarhInputComponent);

export default SarhInput;
