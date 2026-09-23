import { AppIcon } from '@/components/ui/FlaticonIcon';
import type { RegionSelection, SaudiCity, SaudiRegion } from '@/constants/saudiRegions';
import {
  ALL_REGIONS_LABEL,
  SAUDI_REGIONS,
  resolveSaudiMainCities,
} from '@/constants/saudiRegions';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { searchSaudiRegions } from '@/lib/saudiRegionSearch';
import { getRtlRow } from '@/lib/rtl';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  selection: RegionSelection;
  onClose: () => void;
  onSelect: (selection: RegionSelection) => void;
};

/**
 * Bottom-sheet region picker:
 * pick an admin region → its cities appear; Apply commits the draft filter.
 */
export function RegionCityPicker({ visible, selection, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { styles, colors } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors),
    colors: theme.colors,
  }));
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<RegionSelection>(selection);

  useEffect(() => {
    if (visible) {
      setDraft(selection);
      setQuery('');
    }
  }, [visible, selection]);

  const hits = useMemo(() => searchSaudiRegions(query), [query]);
  const mainCities = useMemo(() => resolveSaudiMainCities(), []);
  const searching = query.trim().length > 0;

  const focusedRegion: SaudiRegion | null =
    draft.type === 'region' || draft.type === 'city' ? draft.region : null;

  const apply = () => {
    onSelect(draft);
    onClose();
  };

  const reset = () => {
    setDraft({ type: 'all' });
  };

  const pickRegion = (region: SaudiRegion) => {
    setDraft({ type: 'region', region });
  };

  const pickCity = (region: SaudiRegion, city: SaudiCity) => {
    setDraft({ type: 'city', region, city });
  };

  const regionSelected = (region: SaudiRegion) =>
    (draft.type === 'region' && draft.region.id === region.id) ||
    (draft.type === 'city' && draft.region.id === region.id);

  const citySelected = (city: SaudiCity) =>
    draft.type === 'city' && draft.city.id === city.id;

  const sheetMaxHeight = Math.min(windowHeight * 0.86, 720);

  const citiesSectionTitle = focusedRegion
    ? `مدن ${focusedRegion.nameAr.replace(/^منطقة\s/, '').replace(/^المنطقة\s/, '')}`
    : 'المدن الرئيسية';

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="إغلاق" />
        <View
          style={[
            styles.sheet,
            { maxHeight: sheetMaxHeight, paddingBottom: Math.max(insets.bottom, spacing.md) },
          ]}
        >
          <View style={styles.handle} />

          <View style={[styles.header, getRtlRow()]}>
            <View style={styles.headerTextShell}>
              <Text style={styles.title}>اختر المنطقة</Text>
              <Text style={styles.subtitle}>اختر مدينة أو منطقة</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="إغلاق"
            >
              <AppIcon name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={[styles.searchWrap, getRtlRow()]}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="ابحث عن مدينة أو منطقة"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoCorrect={false}
            />
            <AppIcon name="search" size={18} color={colors.textMuted} />
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
          >
            {searching ? (
              <View style={styles.searchList}>
                {hits.length === 0 ? (
                  <Text style={styles.empty}>لا توجد نتائج</Text>
                ) : (
                  hits.map((hit) => {
                    if (hit.kind === 'region') {
                      const active = draft.type === 'region' && draft.region.id === hit.region.id;
                      return (
                        <Pressable
                          key={`r-${hit.region.id}`}
                          style={[styles.searchRow, active && styles.chipActive]}
                          onPress={() => pickRegion(hit.region)}
                        >
                          <Text style={[styles.searchRowTitle, active && styles.chipTextActive]}>
                            {hit.region.nameAr}
                          </Text>
                          <Text style={styles.searchRowSub}>كل مدن المنطقة</Text>
                        </Pressable>
                      );
                    }
                    const active = citySelected(hit.city);
                    return (
                      <Pressable
                        key={`c-${hit.city.id}`}
                        style={[styles.searchRow, active && styles.chipActive]}
                        onPress={() => pickCity(hit.region, hit.city)}
                      >
                        <Text style={[styles.searchRowTitle, active && styles.chipTextActive]}>
                          {hit.city.nameAr}
                        </Text>
                        <Text style={styles.searchRowSub}>{hit.region.nameAr}</Text>
                      </Pressable>
                    );
                  })
                )}
              </View>
            ) : (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>المناطق الإدارية</Text>
                </View>
                <View style={styles.regionGrid}>
                  {SAUDI_REGIONS.map((region) => {
                    const active = regionSelected(region);
                    return (
                      <Pressable
                        key={region.id}
                        style={[styles.regionChip, active && styles.chipActive]}
                        onPress={() => pickRegion(region)}
                      >
                        <Text
                          numberOfLines={2}
                          style={[styles.regionChipText, active && styles.chipTextActive]}
                        >
                          {region.nameAr}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{citiesSectionTitle}</Text>
                </View>

                {focusedRegion ? (
                  <View style={styles.cityWrap}>
                    <Pressable
                      style={[
                        styles.cityChip,
                        styles.cityChipFlex,
                        draft.type === 'region' &&
                          draft.region.id === focusedRegion.id &&
                          styles.chipActive,
                      ]}
                      onPress={() => pickRegion(focusedRegion)}
                    >
                      <Text
                        style={[
                          styles.cityChipText,
                          draft.type === 'region' &&
                            draft.region.id === focusedRegion.id &&
                            styles.chipTextActive,
                        ]}
                      >
                        كل مدن المنطقة
                      </Text>
                    </Pressable>
                    {focusedRegion.cities.map((city) => {
                      const active = citySelected(city);
                      return (
                        <Pressable
                          key={city.id}
                          style={[styles.cityChip, styles.cityChipFlex, active && styles.chipActive]}
                          onPress={() => pickCity(focusedRegion, city)}
                        >
                          <Text style={[styles.cityChipText, active && styles.chipTextActive]}>
                            {city.nameAr}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={[styles.cityRow, getRtlRow()]}
                  >
                    {mainCities.map(({ region, city }) => {
                      const active = citySelected(city);
                      return (
                        <Pressable
                          key={city.id}
                          style={[styles.cityChip, active && styles.chipActive]}
                          onPress={() => pickCity(region, city)}
                        >
                          <Text style={[styles.cityChipText, active && styles.chipTextActive]}>
                            {city.nameAr}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}

                <Pressable
                  style={[
                    styles.allChip,
                    draft.type === 'all' && styles.chipActive,
                    getRtlRow(),
                  ]}
                  onPress={() => setDraft({ type: 'all' })}
                >
                  <AppIcon
                    name="map-marker-outline"
                    size={15}
                    color={
                      draft.type === 'all' ? colors.electricBright : colors.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.allChipText,
                      draft.type === 'all' && styles.chipTextActive,
                    ]}
                  >
                    {ALL_REGIONS_LABEL}
                  </Text>
                </Pressable>
              </>
            )}
          </ScrollView>

          <View style={[styles.footer, getRtlRow()]}>
            <Pressable
              style={styles.applyBtn}
              onPress={apply}
              accessibilityRole="button"
              accessibilityLabel="تطبيق"
            >
              <Text style={styles.applyText}>تطبيق</Text>
            </Pressable>
            <Pressable
              style={styles.resetBtn}
              onPress={reset}
              accessibilityRole="button"
              accessibilityLabel="إعادة تعيين"
            >
              <Text style={styles.resetText}>إعادة تعيين</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    sheet: {
      backgroundColor: colors.bgElevated || colors.bgDeep,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingTop: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      borderBottomWidth: 0,
    },
    handle: {
      alignSelf: 'center',
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderMid || colors.borderSoft,
      marginBottom: spacing.sm,
    },
    header: {
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.md,
    },
    headerTextShell: {
      flex: 1,
      width: '100%',
      alignItems: 'flex-end',
    },
    title: {
      ...typography.cardHeading,
      fontSize: 20,
      lineHeight: 28,
      color: colors.textPrimary,
      width: '100%',
      writingDirection: 'rtl',
      includeFontPadding: false,
    },
    subtitle: {
      ...typography.caption,
      color: colors.textMuted,
      width: '100%',
      writingDirection: 'rtl',
      marginTop: 2,
      includeFontPadding: false,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    searchWrap: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      paddingHorizontal: spacing.md,
      minHeight: 48,
      borderRadius: radius.lg,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      gap: spacing.sm,
    },
    searchInput: {
      flex: 1,
      ...typography.secondary,
      color: colors.textPrimary,
      writingDirection: 'rtl',
      includeFontPadding: false,
    },
    scroll: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
    sectionHeader: {
      width: '100%',
      alignItems: 'flex-end',
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      width: '100%',
      writingDirection: 'rtl',
      includeFontPadding: false,
    },
    regionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: spacing.md,
      width: '100%',
    },
    regionChip: {
      width: '31.5%',
      minHeight: 46,
      paddingHorizontal: 8,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.bgSurface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    regionChipText: {
      ...typography.caption,
      fontSize: 12,
      lineHeight: 18,
      color: colors.textPrimary,
      textAlign: 'center',
      writingDirection: 'rtl',
      includeFontPadding: false,
    },
    cityRow: {
      gap: 10,
      paddingBottom: spacing.sm,
      marginBottom: spacing.sm,
    },
    cityWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: spacing.md,
      width: '100%',
    },
    cityChip: {
      minHeight: 42,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: colors.bgSurface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cityChipFlex: {
      paddingHorizontal: 14,
    },
    cityChipText: {
      ...typography.caption,
      fontSize: 13,
      color: colors.textPrimary,
      textAlign: 'center',
      writingDirection: 'rtl',
      includeFontPadding: false,
    },
    allChip: {
      minHeight: 46,
      paddingHorizontal: spacing.md,
      borderRadius: 12,
      backgroundColor: colors.bgSurface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      gap: 8,
      marginBottom: spacing.sm,
    },
    allChipText: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      writingDirection: 'rtl',
      includeFontPadding: false,
    },
    chipActive: {
      borderColor: colors.electricBright,
      backgroundColor: `${colors.electricBright}14`,
    },
    chipTextActive: {
      color: colors.electricBright,
    },
    searchList: {
      gap: spacing.xs,
    },
    searchRow: {
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderRadius: 12,
      backgroundColor: colors.bgSurface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      marginBottom: spacing.xs,
    },
    searchRowTitle: {
      ...typography.cardHeading,
      color: colors.textPrimary,
      width: '100%',
      writingDirection: 'rtl',
      includeFontPadding: false,
    },
    searchRowSub: {
      ...typography.caption,
      color: colors.textMuted,
      width: '100%',
      writingDirection: 'rtl',
      includeFontPadding: false,
    },
    empty: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.xl,
      writingDirection: 'rtl',
    },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      gap: 12,
      alignItems: 'center',
    },
    applyBtn: {
      flex: 1,
      minHeight: 50,
      borderRadius: 14,
      backgroundColor: colors.electricBright,
      alignItems: 'center',
      justifyContent: 'center',
    },
    applyText: {
      ...typography.bodyStrong,
      color: '#FFFFFF',
      includeFontPadding: false,
    },
    resetBtn: {
      flex: 1,
      minHeight: 50,
      borderRadius: 14,
      backgroundColor: colors.bgSurface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resetText: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
      includeFontPadding: false,
    },
  });
}

export default RegionCityPicker;
