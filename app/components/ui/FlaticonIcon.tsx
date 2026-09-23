import React, { memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  DEFAULT_ICON_SIZE,
  ICON_STROKE,
  resolveLucideIcon,
} from '@/lib/lucideIconMap';

export { DEFAULT_ICON_SIZE };

export type AppIconProps = {
  /** Legacy Ionicons / Flaticon names — resolved via lucideIconMap */
  name: string;
  /** sr/br = filled look; rr = outline (default) */
  variant?: 'rr' | 'sr' | 'br' | string;
  size?: number;
  color?: string;
  /** Override Lucide stroke. Defaults to ICON_STROKE (or 2.5 when variant is br). */
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

function LucideAppIcon({
  name,
  variant,
  size = DEFAULT_ICON_SIZE,
  color,
  strokeWidth: strokeWidthProp,
  style,
}: AppIconProps) {
  const Icon = resolveLucideIcon(name);
  const solid = variant === 'sr' || variant === 'br';
  const strokeWidth = strokeWidthProp ?? (variant === 'br' ? 2.5 : ICON_STROKE);

  return (
    <Icon
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      fill={solid && color ? color : 'transparent'}
      style={style}
    />
  );
}

/** Lucide icons — same import path as before for app-wide compatibility */
export const AppIcon = memo(LucideAppIcon);
export const LucideIcon = AppIcon;
/** @deprecated use AppIcon or LucideIcon */
export const FlaticonIcon = AppIcon;
