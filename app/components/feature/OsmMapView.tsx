import { Image } from '@/components/ui/AppImage';
import { StyleSheet, View } from 'react-native';
import { osmStaticMapUrl } from '@/lib/osmMap';

type Props = {
  lat: number;
  lng: number;
  height: number;
};

/** Native / fallback — OSM static map image */
export function OsmMapView({ lat, lng, height }: Props) {
  return (
    <View style={[styles.wrap, { height }]}>
      <Image
        source={{ uri: osmStaticMapUrl(lat, lng, 640, Math.round(height * 2)) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#1a2332',
  },
});
