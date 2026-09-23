import {
  LinearGradient as ExpoLinearGradient,
  type LinearGradientProps as ExpoLinearGradientProps,
} from 'expo-linear-gradient';
import type { ColorValue } from 'react-native';

export interface LinearGradientProps
  extends Omit<ExpoLinearGradientProps, 'colors' | 'locations'> {
  colors: readonly ColorValue[];
  locations?: readonly number[] | null;
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

/** Typed wrapper that accepts readonly theme color tuples. */
export function LinearGradient({
  colors,
  locations,
  ...props
}: LinearGradientProps) {
  return (
    <ExpoLinearGradient
      colors={colors as [ColorValue, ColorValue, ...ColorValue[]]}
      locations={locations as [number, number, ...number[]] | null | undefined}
      {...props}
    />
  );
}
