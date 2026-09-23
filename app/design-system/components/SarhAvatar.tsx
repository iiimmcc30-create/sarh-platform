import { StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { Image, uriSource } from '@/components/ui/AppImage';
import { colors, radius, space } from '../tokens';
import { AppText } from './AppText';
import { AVATAR_SIZE, avatarInitials, type SarhAvatarSize } from './resolvers';

export type SarhAvatarProps = {
  uri?: string | null;
  source?: ImageSourcePropType | null;
  name?: string;
  fallback?: string;
  size?: SarhAvatarSize;
  online?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export { AVATAR_SIZE, avatarInitials } from './resolvers';
export type { SarhAvatarSize } from './resolvers';

export function SarhAvatar({
  uri,
  source,
  name,
  fallback,
  size = 'md',
  online,
  accessibilityLabel,
  style,
}: SarhAvatarProps) {
  const flat = StyleSheet.flatten(style);
  const box = typeof flat?.width === 'number' ? flat.width : AVATAR_SIZE[size];
  const initials = avatarInitials(name, fallback);
  const label = accessibilityLabel ?? name ?? 'الصورة الشخصية';
  const imageSource = source ?? uriSource(uri);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[{ width: box, height: box, borderRadius: radius[999], overflow: 'hidden' }, style]}
    >
      <View
        style={{
          width: '100%',
          height: '100%',
          borderRadius: radius[999],
          backgroundColor: colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {imageSource ? (
          <Image source={imageSource} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <AppText
            variant={size === 'xs' || size === 'sm' ? 'micro' : 'label'}
            color="textPrimary"
            align="center"
          >
            {initials}
          </AppText>
        )}
      </View>
      {online ? (
        <View
          accessibilityLabel="متصل"
          style={{
            position: 'absolute',
            bottom: 0,
            start: 0,
            width: space[8],
            height: space[8],
            borderRadius: radius[999],
            backgroundColor: colors.success,
            borderWidth: 1,
            borderColor: colors.background,
          }}
        />
      ) : null}
    </View>
  );
}

export default SarhAvatar;
