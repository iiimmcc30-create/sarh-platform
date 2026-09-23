import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { getRtlDirection } from '@/lib/rtl';
import { SURFACE_TONE, type SarhSurfaceTone } from './resolvers';

export type SarhSurfaceProps = ViewProps & {
  tone?: SarhSurfaceTone;
  style?: StyleProp<ViewStyle>;
};

export { SURFACE_TONE } from './resolvers';
export type { SarhSurfaceTone } from './resolvers';

export function SarhSurface({ tone = 'surface', style, ...rest }: SarhSurfaceProps) {
  return (
    <View
      {...rest}
      style={[getRtlDirection(), { backgroundColor: SURFACE_TONE[tone] }, style]}
    />
  );
}

export default SarhSurface;
