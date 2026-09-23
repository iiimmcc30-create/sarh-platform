import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import {
  resolveSarhCardStyle,
  resolveSurfaceLevelStyle,
  type SarhCardPadding,
  type SarhCardVariant,
  type SarhSurfaceLevel,
} from './resolvers';

export type SarhCardProps = {
  children?: ReactNode;
  variant?: SarhCardVariant;
  /** Architecture V2 surface hierarchy. Takes precedence over `variant`. */
  level?: SarhSurfaceLevel;
  padding?: SarhCardPadding;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export { CARD_PADDING, resolveSarhCardStyle, resolveSurfaceLevelStyle } from './resolvers';
export type { SarhCardPadding, SarhCardVariant, SarhSurfaceLevel } from './resolvers';

export function SarhCard({
  children,
  variant = 'default',
  level,
  padding = 'md',
  style,
  testID,
}: SarhCardProps) {
  const chrome = level
    ? resolveSurfaceLevelStyle(level, padding)
    : resolveSarhCardStyle(variant, padding);
  return (
    <View testID={testID} style={[chrome, style]}>
      {children}
    </View>
  );
}

export default SarhCard;
