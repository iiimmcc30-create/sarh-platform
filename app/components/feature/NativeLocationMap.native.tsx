import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '@/constants/theme';
import { COUNTRY_MAP_CENTER } from '@/lib/butcherLocation';

export interface NativeLocationMapProps {
  lat: number;
  lng: number;
  cityLabel?: string;
  height: number;
  interactive?: boolean;
  onPick?: (lat: number, lng: number) => void;
}

export function NativeLocationMap({
  lat,
  lng,
  cityLabel,
  height,
  interactive = false,
  onPick,
}: NativeLocationMapProps) {
  const [MapModule, setMapModule] = useState<typeof import('react-native-maps') | null>(null);

  useEffect(() => {
    let active = true;
    import('react-native-maps')
      .then((mod) => { if (active) setMapModule(mod); })
      .catch(() => { if (active) setMapModule(null); });
    return () => { active = false; };
  }, []);

  if (!MapModule) {
    return (
      <View style={[styles.map, styles.loading, { height }]}>
        <ActivityIndicator color={colors.electricBright} />
      </View>
    );
  }

  const { default: MapView, Marker, PROVIDER_GOOGLE } = MapModule;
  const center = COUNTRY_MAP_CENTER.SA;
  const region = {
    latitude: lat,
    longitude: lng,
    latitudeDelta: center.delta,
    longitudeDelta: center.delta,
  };

  return (
    <View style={[styles.map, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        onPress={(event) => {
          if (!onPick) return;
          const coord = event.nativeEvent.coordinate;
          onPick(coord.latitude, coord.longitude);
        }}
      >
        <Marker coordinate={{ latitude: lat, longitude: lng }} title={cityLabel} pinColor={colors.electric} />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
