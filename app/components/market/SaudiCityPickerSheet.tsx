import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { SheetModal } from '@/components/ui/SheetModal';
import { SheetSurface } from '@/components/ui/sheets/SheetSurface';
import { SheetRow } from '@/components/ui/sheets/SheetRow';
import { SheetGroup } from '@/components/ui/sheets/SheetGroup';
import { SHEET_GUTTER } from '@/components/ui/sheets/sheetLayout';
import { radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow } from '@/lib/rtl';
import {
  saudiRegionNameAr,
  searchSaudiCities,
  type SaudiCityEntry,
} from '@/lib/saudiCities';

type Props = {
  visible: boolean;
  title?: string;
  message?: string;
  selectedId?: string | null;
  onClose: () => void;
  onSelect: (city: SaudiCityEntry) => void;
  /** Optional top row «استخدم موقعي الحالي» (GPS → nearest city). */
  onUseLocation?: () => void;
  locating?: boolean;
  testID?: string;
};

/**
 * Searchable Saudi city picker on the shared sheet system (SheetModal + SheetSurface +
 * SheetRow). Same city list as the backend (constants/saudiCities.generated.ts).
 */
export function SaudiCityPickerSheet({
  visible,
  title = 'اختر مدينتك',
  message,
  selectedId,
  onClose,
  onSelect,
  onUseLocation,
  locating = false,
  testID = 'saudi-city-picker',
}: Props) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const results = useMemo(() => searchSaudiCities(query), [query]);

  return (
    <SheetModal visible={visible} onClose={onClose} keyboardAvoiding testID={testID}>
      <SheetSurface title={title} message={message} style={{ maxHeight: Math.min(height * 0.86, 720) }}>
        <View
          style={[
            styles.search,
            getRtlRow(),
            { backgroundColor: colors.bgElevated, borderColor: colors.borderSoft },
          ]}
        >
          <AppIcon name="search" size={17} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث عن مدينة أو محافظة"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.textPrimary }]}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="ابحث عن مدينة"
            testID={`${testID}-search`}
          />
        </View>

        {onUseLocation && !query.trim() ? (
          <SheetGroup style={styles.locationGroup}>
            {locating ? (
              <View style={[styles.locatingRow, getRtlRow()]}>
                <ActivityIndicator size="small" color={colors.textPrimary} />
              </View>
            ) : (
              <SheetRow
                label="استخدم موقعي الحالي"
                subtitle="نختار أقرب مدينة لك تلقائياً"
                icon="navigation"
                onPress={onUseLocation}
                testID={`${testID}-gps`}
              />
            )}
          </SheetGroup>
        ) : null}

        <FlatList
          data={results}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={16}
          style={styles.list}
          renderItem={({ item, index }) => (
            <SheetRow
              label={item.nameAr}
              subtitle={saudiRegionNameAr(item.regionId)}
              selected={item.id === selectedId}
              showDivider={index < results.length - 1}
              onPress={() => {
                onSelect(item);
                onClose();
              }}
              testID={`${testID}-row-${item.id}`}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <SheetRow label="لا توجد مدينة بهذا الاسم" onPress={() => setQuery('')} />
            </View>
          }
        />
      </SheetSurface>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  search: {
    marginHorizontal: SHEET_GUTTER,
    marginBottom: spacing.sm,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.secondary,
    writingDirection: 'rtl',
    textAlign: 'right',
    paddingVertical: 8,
  },
  locationGroup: { marginBottom: spacing.sm },
  locatingRow: { minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  list: { flexGrow: 0 },
  empty: { paddingVertical: spacing.md },
});

export default SaudiCityPickerSheet;
