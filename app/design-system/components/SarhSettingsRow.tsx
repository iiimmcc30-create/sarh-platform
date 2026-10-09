import { Pressable, Switch, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow, rtlForwardIcon } from '@/lib/rtl';
import { colors, functional, motion, space } from '../tokens';
import { AppText } from './AppText';
import { SarhDivider } from './SarhDivider';

export type SarhSettingsRowProps = {
  title: string;
  icon?: string;
  value?: string;
  onPress?: () => void;
  switchValue?: boolean;
  onSwitchChange?: (next: boolean) => void;
  showChevron?: boolean;
  showDivider?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** `danger`: muted-red title and icon (logout / delete). */
  tone?: 'default' | 'danger';
  /** Optional second line under the title. */
  subtitle?: string;
  /** iOS selection list: a checkmark on the end instead of a radio (no chevron). */
  checked?: boolean;
  /** Latin / numeric value (phone, email): keep LTR digits inside the RTL row. */
  valueLtr?: boolean;
  testID?: string;
};

export const SETTINGS_ROW = {
  minHeight: space[48] + space[4],
  paddingHorizontal: space[16],
  paddingVertical: space[12],
  gap: space[12],
  icon: space[20],
  chevron: space[16],
} as const;

export function SarhSettingsRow({
  title,
  icon,
  value,
  onPress,
  switchValue,
  onSwitchChange,
  showChevron,
  showDivider = true,
  disabled = false,
  accessibilityLabel,
  tone = 'default',
  subtitle,
  checked,
  valueLtr = false,
  testID,
}: SarhSettingsRowProps) {
  useTheme();
  const isSwitch = typeof switchValue === 'boolean' && !!onSwitchChange;
  const isCheck = typeof checked === 'boolean';
  const chevron = showChevron ?? (!isSwitch && !isCheck && !!onPress);
  const label = accessibilityLabel ?? title;

  const body = (
    <View
      style={[
        getRtlRow(),
        {
          alignItems: 'center',
          minHeight: SETTINGS_ROW.minHeight,
          paddingHorizontal: SETTINGS_ROW.paddingHorizontal,
          paddingVertical: SETTINGS_ROW.paddingVertical,
          gap: SETTINGS_ROW.gap,
          opacity: disabled ? motion.opacity.disabled : 1,
        },
      ]}
    >
      {icon ? (
        <AppIcon
          name={icon}
          size={SETTINGS_ROW.icon}
          color={tone === 'danger' ? colors.danger : colors.textSecondary}
        />
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText
          variant="label"
          color={tone === 'danger' ? 'danger' : 'textPrimary'}
          numberOfLines={1}
        >
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textMuted" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText
          variant="bodySmall"
          color="textMuted"
          numberOfLines={1}
          style={[{ flexShrink: 1, maxWidth: '55%' }, valueLtr ? { writingDirection: 'ltr' } : null]}
        >
          {value}
        </AppText>
      ) : null}
      {isSwitch ? (
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
      ) : null}
      {isCheck ? (
        <View style={{ width: SETTINGS_ROW.icon, alignItems: 'center' }}>
          {checked ? <AppIcon name="checkmark" size={SETTINGS_ROW.icon} color={colors.textPrimary} /> : null}
        </View>
      ) : null}
      {chevron ? (
        <AppIcon name={rtlForwardIcon()} size={SETTINGS_ROW.chevron} color={colors.textMuted} />
      ) : null}
    </View>
  );

  return (
    <View>
      {onPress && !isSwitch ? (
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={isCheck ? { disabled, selected: !!checked } : { disabled }}
          disabled={disabled}
          onPress={disabled ? undefined : onPress}
          // iOS list row: dims on press, never shrinks.
          style={({ pressed }) => ({
            opacity: pressed ? motion.opacity.pressed : 1,
          })}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      {showDivider ? <SarhDivider inset /> : null}
    </View>
  );
}

export default SarhSettingsRow;
