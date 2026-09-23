// SAFAT — Map preview with location pin (schematic + optional native)
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { getRtlText } from '@/lib/rtl';

import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import {
  formatCoords,
  getLocationPinPosition,
  hasValidCoords,
  COUNTRY_MAP_CENTER,
} from '@/lib/butcherLocation';
import { isNativeMapsEnabled } from '@/lib/maps';
import { Country } from '@/services/types';
import { NativeLocationMap } from '@/components/feature/NativeLocationMap';
import { OsmMapView } from '@/components/feature/OsmMapView';
import { formatLocationLabel } from '@/lib/formatAddress';

interface LocationMapPreviewProps {
  country: Country;
  cityLabel?: string;
  lat?: number | null;
  lng?: number | null;
  height?: number;
  /** Show GPS locate button on map */
  showLocateButton?: boolean;
  onLocate?: () => void;
  locating?: boolean;
  /** Stable id for pin jitter when no GPS (e.g. listing id) */
  pinSeed?: string;
  /** Tap the map to drop a pin (delivery address picker). */
  onPick?: (lat: number, lng: number) => void;
}

function SchematicMap({
  country,
  cityLabel,
  lat,
  lng,
  pinSeed,
  height,
  styles,
  colors,
}: LocationMapPreviewProps & {
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  const pos = useMemo(
    () => getLocationPinPosition(country, lat, lng, pinSeed),
    [country, lat, lng, pinSeed],
  );

  return (
    <View style={[styles.map, { height }]}>
      <LinearGradient
        colors={['#0B1A4E', '#102260', '#0B1A4E']}
        style={StyleSheet.absoluteFill}
      />
      {[...Array(6)].map((_, i) => (
        <View key={`h${i}`} style={[styles.gridH, { top: `${(i + 1) * 14}%` }]} />
      ))}
      {[...Array(6)].map((_, i) => (
        <View key={`v${i}`} style={[styles.gridV, { left: `${(i + 1) * 14}%` }]} />
      ))}

      {/* Location pin */}
      <View style={[styles.pinWrap, { left: `${pos.x}%`, top: `${pos.y}%` }]}>
        <View style={styles.pinPulse} />
        <View style={styles.pinHead}>
          <AppIcon name="location" size={22} color="#fff" />
        </View>
        <View style={styles.pinTail} />
        {cityLabel ? (
          <View style={styles.pinLabel}>
            <Text style={styles.pinLabelText} numberOfLines={1}>{cityLabel}</Text>
          </View>
        ) : null}
      </View>

      {hasValidCoords(lat, lng) ? (
        <View style={styles.coordsChip}>
          <AppIcon name="navigate" size={12} color={colors.electricBright} />
          <Text style={styles.coordsChipText} numberOfLines={2}>
            {cityLabel?.trim() || formatCoords(lat!, lng!)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function LocationMapPreview({
  country,
  cityLabel,
  lat,
  lng,
  height = 200,
  showLocateButton = false,
  onLocate,
  locating = false,
  pinSeed,
  onPick,
}: LocationMapPreviewProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const interactive = Boolean(onPick);
  const hasCoords = hasValidCoords(lat, lng);
  const center = COUNTRY_MAP_CENTER.SA;
  const pinLat = hasCoords ? lat! : center.lat;
  const pinLng = hasCoords ? lng! : center.lng;
  const useNative =
    Platform.OS !== 'web' &&
    isNativeMapsEnabled() &&
    (hasCoords || interactive);

  const useOsm = hasCoords && !useNative && !interactive;
  const locationCaption = formatLocationLabel(cityLabel, undefined, lat, lng);

  return (
    <View style={styles.wrap}>
      {useNative ? (
        <NativeLocationMap
          lat={pinLat}
          lng={pinLng}
          cityLabel={cityLabel}
          height={height}
          interactive={interactive}
          onPick={onPick}
        />
      ) : useOsm ? (
        <OsmMapView lat={lat!} lng={lng!} height={height} />
      ) : (
        <SchematicMap
          country={country}
          cityLabel={cityLabel}
          lat={lat}
          lng={lng}
          pinSeed={pinSeed}
          height={height}
          styles={styles}
          colors={colors}
        />
      )}

      {useOsm && locationCaption ? (
        <View style={styles.addressBanner}>
          <AppIcon name="location" size={14} color={colors.electricBright} />
          <Text style={styles.addressBannerText} numberOfLines={2}>{locationCaption}</Text>
        </View>
      ) : null}

      {showLocateButton && onLocate ? (
        <Pressable
          style={styles.locateBtn}
          onPress={onLocate}
          disabled={locating}
        >
          {locating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <AppIcon name="locate" size={16} color="#fff" />
              <Text style={styles.locateBtnText}>موقعي الحالي</Text>
            </>
          )}
        </Pressable>
      ) : null}

      {!cityLabel && !hasValidCoords(lat, lng) ? (
        <View style={styles.hintOverlay}>
          <AppIcon name="map-outline" size={14} color={colors.textMuted} />
          <Text style={styles.hintText}>حدّد الموقع على الخريطة</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  wrap: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgSurface,
    position: 'relative',
  },
  map: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pinWrap: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 10,
    transform: [{ translateX: -20 }, { translateY: -44 }],
  },
  pinPulse: {
    position: 'absolute',
    top: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.electric}30`,
  },
  pinHead: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.electric,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.electric,
    marginTop: -2,
  },
  pinLabel: {
    marginTop: 4,
    backgroundColor: 'rgba(6,9,26,0.88)',
    borderWidth: 1,
    borderColor: colors.borderMid,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: 140,
  },
  pinLabelText: {
    ...typography.caption,
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
  coordsChip: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(6,9,26,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  coordsChipText: {
    ...typography.micro,
    color: colors.textBrandStrong,
  },
  locateBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.electric,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.electricBright,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  locateBtnText: {
    ...typography.caption,
    color: '#fff',
    fontWeight: '600',
  },
  hintOverlay: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(6,9,26,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  hintText: {
    ...typography.micro,
    color: colors.textMuted,
  },
  addressBanner: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(6,9,26,0.88)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  addressBannerText: {
    ...typography.caption,
    color: '#fff',
    flex: 1,
    ...getRtlText(),
    fontWeight: '600',
  },
});
}
