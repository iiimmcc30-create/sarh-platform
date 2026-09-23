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
}: SarhSettingsRowProps) {
  useTheme();
  const isSwitch = typeof switchValue === 'boolean' && !!onSwitchChange;
  const chevron = showChevron ?? (!isSwitch && !!onPress);
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
      {icon ? <AppIcon name={icon} size={SETTINGS_ROW.icon} color={colors.textSecondary} /> : null}
      <AppText variant="label" color="textPrimary" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
        {title}
      </AppText>
      {value ? (
        <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {value}
        </AppText>
      ) : null}
      {isSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          disabled={disabled}
          trackColor={{ false: colors.surfaceElevated, true: colors.primary }}
          thumbColor={functional.onPrimary}
          ios_backgroundColor={colors.surfaceElevated}
          accessibilityLabel={label}
        />
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
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={disabled ? undefined : onPress}
          style={({ pressed }) => ({
            opacity: pressed ? motion.opacity.pressed : 1,
            transform: [{ scale: pressed && !disabled ? motion.pressScale : 1 }],
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
