import type { ReactNode } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow, rtlForwardIcon } from '@/lib/rtl';
import { colors, functional, motion, space } from '../tokens';
import { AppText } from './AppText';

export type SarhSettingsRowProps = {
  title: string;
  icon?: string;
  value?: string;
  onPress?: () => void;
  switchValue?: boolean;
  onSwitchChange?: (next: boolean) => void;
  /** X settings rows have no chevron; opt in only where a row must hint navigation. */
  showChevron?: boolean;
  /** @deprecated X settings lists have no row separators — kept for call-site compatibility, ignored. */
  showDivider?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** `danger`: muted-red title and icon (logout / delete). */
  tone?: 'default' | 'danger';
  /** Grey description under the title (X: up to three lines). */
  subtitle?: string;
  /** Selection list: a checkmark at the inline end (left in RTL). */
  checked?: boolean;
  /** Latin / numeric value (phone, email): keep LTR digits inside the RTL row. */
  valueLtr?: boolean;
  /** @deprecated X rows use a plain outline icon — kept for compatibility, ignored. */
  iconTile?: boolean;
  /** Optional trailing node (e.g. a status pill). */
  accessory?: ReactNode;
  testID?: string;
};

/**
 * X settings row: thin outline icon on the start side (right in RTL), white
 * title, grey 2–3 line description, generous vertical rhythm, no separators,
 * no chevrons. Switches / checkmarks sit inline at the end (left in RTL).
 */
export const SETTINGS_ROW = {
  minHeight: space[48] + space[8],
  paddingHorizontal: space[16],
  paddingVertical: space[16],
  gap: space[16],
  icon: space[24] - 2,
  chevron: space[16],
  iconStroke: 1.5,
} as const;

export function SarhSettingsRow({
  title,
  icon,
  value,
  onPress,
  switchValue,
  onSwitchChange,
  showChevron = false,
  disabled = false,
  accessibilityLabel,
  tone = 'default',
  subtitle,
  checked,
  valueLtr = false,
  accessory,
  testID,
}: SarhSettingsRowProps) {
  useTheme();
  const isSwitch = typeof switchValue === 'boolean' && !!onSwitchChange;
  const isCheck = typeof checked === 'boolean';
  const label = accessibilityLabel ?? title;
  const danger = tone === 'danger';

  const body = (
    <View
      style={[
        getRtlRow(),
        {
          alignItems: subtitle ? 'flex-start' : 'center',
          minHeight: SETTINGS_ROW.minHeight,
          paddingHorizontal: SETTINGS_ROW.paddingHorizontal,
          paddingVertical: SETTINGS_ROW.paddingVertical,
          gap: SETTINGS_ROW.gap,
          opacity: disabled ? motion.opacity.disabled : 1,
        },
      ]}
    >
      {icon ? (
        <View style={{ paddingTop: subtitle ? 2 : 0 }}>
          <AppIcon
            name={icon}
            size={SETTINGS_ROW.icon}
            strokeWidth={SETTINGS_ROW.iconStroke}
            color={danger ? colors.danger : colors.textSecondary}
          />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: space[4] }}>
        <AppText variant="label" color={danger ? 'danger' : 'textPrimary'} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodySmall" color="textMuted" numberOfLines={3}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText
          variant="bodySmall"
          color="textMuted"
          numberOfLines={1}
          style={[
            { flexShrink: 1, maxWidth: '45%', alignSelf: 'center' },
            valueLtr ? { writingDirection: 'ltr' } : null,
          ]}
        >
          {value}
        </AppText>
      ) : null}
      {accessory ? <View style={{ alignSelf: 'center' }}>{accessory}</View> : null}
      {isSwitch ? (
        <View style={{ alignSelf: 'center' }}>
          <Switch
            value={switchValue}
            onValueChange={onSwitchChange}
            disabled={disabled}
            trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
            thumbColor={switchValue ? functional.onAccent : functional.onPrimary}
            ios_backgroundColor={colors.surfaceElevated}
            accessibilityLabel={label}
            testID={testID}
          />
        </View>
      ) : null}
      {isCheck ? (
        <View style={{ width: SETTINGS_ROW.icon, alignItems: 'center', alignSelf: 'center' }}>
          {checked ? <AppIcon name="checkmark" size={SETTINGS_ROW.icon} color={colors.textPrimary} /> : null}
        </View>
      ) : null}
      {showChevron ? (
        <View style={{ alignSelf: 'center' }}>
          <AppIcon name={rtlForwardIcon()} size={SETTINGS_ROW.chevron} color={colors.textMuted} />
        </View>
      ) : null}
    </View>
  );

  if (onPress && !isSwitch) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={subtitle}
        accessibilityState={isCheck ? { disabled, selected: !!checked } : { disabled }}
        disabled={disabled}
        onPress={disabled ? undefined : onPress}
        // X list row: a faint surface tint while pressed, never shrinks.
        style={({ pressed }) => ({ backgroundColor: pressed ? colors.surfaceElevated : 'transparent' })}
      >
        {body}
      </Pressable>
    );
  }
  return body;
}

export default SarhSettingsRow;
