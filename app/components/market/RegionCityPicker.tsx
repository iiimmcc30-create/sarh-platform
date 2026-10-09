import { useEffect, useMemo, useState } from 'react';
import type { RegionSelection } from '@/constants/saudiRegions';
import { ALL_REGIONS_LABEL } from '@/constants/saudiRegions';
import {
  GroupedPickerSheet,
  type GroupedPickerSection,
} from '@/components/ui/sheets/GroupedPickerSheet';
import {
  buildRegionSections,
  isCitySelected,
  isRegionSelected,
} from '@/lib/pickerSections';

type Props = {
  visible: boolean;
  selection: RegionSelection;
  onClose: () => void;
  onSelect: (selection: RegionSelection) => void;
  /** «القريب مني» shortcut → the distance feed («القريب»). */
  onNearby?: () => void;
  nearbyActive?: boolean;
};

/**
 * «كل المناطق» picker: large sheet, sticky search, «كل المناطق» + «القريب مني» on top,
 * then the 13 regions as grouped sections (whole-region row + its cities) from the
 * shared SaudiCity list. Picking a row applies and closes; «إعادة تعيين» = all regions.
 */
export function RegionCityPicker({
  visible,
  selection,
  onClose,
  onSelect,
  onNearby,
  nearbyActive = false,
}: Props) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const pick = (next: RegionSelection) => {
    onSelect(next);
    onClose();
  };

  const sections = useMemo<GroupedPickerSection[]>(() => {
    const regionSections = buildRegionSections(query);
    const top: GroupedPickerSection = {
      key: 'top',
      rows: [
        {
          key: 'all',
          label: ALL_REGIONS_LABEL,
          selected: selection.type === 'all' && !nearbyActive,
          onPress: () => pick({ type: 'all' }),
          testID: 'region-picker-all',
        },
        ...(onNearby
          ? [
              {
                key: 'nearby',
                label: 'القريب مني',
                subtitle: 'الإعلانات حسب المسافة من موقعك',
                icon: 'navigation',
                selected: nearbyActive,
                onPress: () => {
                  onClose();
                  onNearby();
                },
                testID: 'region-picker-nearby',
              },
            ]
          : []),
      ],
    };
    const groups = regionSections.map<GroupedPickerSection>((s) => ({
      key: s.region.id,
      title: s.title,
      rows: [
        ...(s.showWholeRegion
          ? [
              {
                key: `region-${s.region.id}`,
                label: `كل ${s.title}`,
                selected: isRegionSelected(selection, s.region),
                onPress: () => pick({ type: 'region', region: s.region }),
                testID: `region-picker-region-${s.region.id}`,
              },
            ]
          : []),
        ...s.cities.map((city) => ({
          key: `city-${city.id}`,
          label: city.nameAr,
          selected: isCitySelected(selection, city),
          onPress: () => pick({ type: 'city', region: s.region, city }),
          testID: `region-picker-city-${city.id}`,
        })),
      ],
    }));
    return query.trim() ? groups : [top, ...groups];
    // pick/onClose/onNearby are stable enough per render; selection drives the checkmarks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selection, nearbyActive, onNearby]);

  return (
    <GroupedPickerSheet
      visible={visible}
      title="المنطقة"
      searchPlaceholder="ابحث عن منطقة أو مدينة"
      query={query}
      onQueryChange={setQuery}
      sections={sections}
      onClose={onClose}
      onReset={() => pick({ type: 'all' })}
      resetDisabled={selection.type === 'all'}
      emptyText="لا توجد مدينة بهذا الاسم"
      testID="region-city-picker"
    />
  );
}

export default RegionCityPicker;
