import { Image as ExpoImage, type ImageProps as ExpoImageProps } from 'expo-image';
import { useCallback, useState } from 'react';
import {
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  StyleSheet,
  View,
} from 'react-native';
import { resolveMediaUrl } from '@/services/media';
import { useTheme } from '@/hooks/useTheme';

type ContentFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';

export interface AppImageProps extends Omit<ExpoImageProps, 'source' | 'contentFit'> {
  source?: ImageSourcePropType | null;
  contentFit?: ContentFit;
  transition?: number;
  priority?: 'low' | 'normal' | 'high';
}

export function uriSource(uri?: string | null): ImageSourcePropType | undefined {
  const resolved = resolveMediaUrl(uri);
  if (!resolved) return undefined;
  return { uri: resolved };
}

function hasValidUri(source: ImageSourcePropType | null | undefined): boolean {
  if (!source) return false;
  if (typeof source === 'number') return true;
  if (Array.isArray(source)) return source.some((s) => hasValidUri(s));
  const uri = (source as { uri?: string }).uri;
  return typeof uri === 'string' && uri.trim().length > 0;
}

/** Soft surface when media is missing or fails to load (avoids solid black tiles). */
export function Image({
  contentFit = 'cover',
  transition = 200,
  priority = 'normal',
  style,
  source,
  onError,
  ...props
}: AppImageProps) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const handleError = useCallback(
    (event: Parameters<NonNullable<ExpoImageProps['onError']>>[0]) => {
      setFailed(true);
      onError?.(event);
    },
    [onError],
  );

  if (!hasValidUri(source) || failed) {
    return (
      <View
        style={[styles.placeholder, { backgroundColor: colors.bgElevated }, style as StyleProp<ImageStyle>]}
        accessibilityLabel="تعذّر تحميل الصورة"
      />
    );
  }

  return (
    <ExpoImage
      {...props}
      source={source as ExpoImageProps['source']}
      style={style as StyleProp<ImageStyle>}
      contentFit={contentFit}
      transition={transition}
      priority={priority}
      cachePolicy="memory-disk"
      allowDownscaling
      onError={handleError}
      recyclingKey={
        typeof source === 'object' && source && !Array.isArray(source) && 'uri' in source
          ? source.uri
          : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: 'transparent',
  },
});
