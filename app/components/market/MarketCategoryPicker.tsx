import { useEffect, useMemo, useState } from 'react';
import type { MarketCategory } from '@/services/categories';
import {
  GroupedPickerSheet,
  type GroupedPickerSection,
} from '@/components/ui/sheets/GroupedPickerSheet';
import { buildCategorySections, type CategorySelection } from '@/lib/pickerSections';

export type { CategorySelection };

type Props = {
  visible: boolean;
  categories: MarketCategory[];
  selection: CategorySelection;
  onClose: () => void;
  onSelect: (selection: CategorySelection) => void;
};

export function categorySelectionLabel(
  categories: MarketCategory[],
  selection: CategorySelection,
): string {
  if (!selection.parentId) return 'التصنيف';
  const parent = categories.find((c) => c.id === selection.parentId);
  if (!parent) return 'التصنيف';
  if (selection.subId) {
    const sub = parent.children?.find((c) => c.id === selection.subId);
    return sub?.nameAr ?? parent.nameAr;
  }
  return parent.nameAr;
}

/**
 * «التصنيف» picker: large sheet, sticky search, «الكل» on top, then each animal type
 * (MarketCategory parent; «الكل» / «كل …» rows are text-only) as a grouped section with a
 * «كل …» row and its subcategories/breeds. Picking applies and closes.
 */
export function MarketCategoryPicker({ visible, categories, selection, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const pick = (next: CategorySelection) => {
    onSelect(next);
    onClose();
  };

  const sections = useMemo<GroupedPickerSection[]>(() => {
    const groups = buildCategorySections(categories, query).map<GroupedPickerSection>((s) => {
      return {
        key: s.parent.id,
        title: s.parent.nameAr,
        rows: [
          ...(s.showWholeParent
            ? [
                {
                  key: `parent-${s.parent.id}`,
                  label: s.subs.length > 0 ? `كل ${s.parent.nameAr}` : s.parent.nameAr,
                  selected: selection.parentId === s.parent.id && selection.subId === null,
                  onPress: () => pick({ parentId: s.parent.id, subId: null }),
                  testID: `category-picker-parent-${s.parent.id}`,
                },
              ]
            : []),
          ...s.subs.map((sub) => ({
            key: `sub-${sub.id}`,
            label: sub.nameAr,
            selected: selection.parentId === s.parent.id && selection.subId === sub.id,
            onPress: () => pick({ parentId: s.parent.id, subId: sub.id }),
            testID: `category-picker-sub-${sub.id}`,
          })),
        ],
      };
    });
    if (query.trim()) return groups;
    return [
      {
        key: 'top',
        rows: [
          {
            key: 'all',
            label: 'الكل',
            selected: selection.parentId === null,
            onPress: () => pick({ parentId: null, subId: null }),
            testID: 'category-picker-all',
          },
        ],
      },
      ...groups,
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, query, selection]);

  return (
    <GroupedPickerSheet
      visible={visible}
      title="التصنيف"
      searchPlaceholder="ابحث عن نوع أو سلالة"
      query={query}
      onQueryChange={setQuery}
      sections={sections}
      onClose={onClose}
      onReset={() => pick({ parentId: null, subId: null })}
      resetDisabled={selection.parentId === null}
      emptyText={categories.length === 0 ? 'لا توجد تصنيفات' : 'لا يوجد تصنيف بهذا الاسم'}
      testID="market-category-picker"
    />
  );
}

export default MarketCategoryPicker;
