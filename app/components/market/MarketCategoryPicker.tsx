import { AppIcon } from '@/components/ui/FlaticonIcon';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import type { MarketCategory } from '@/services/categories';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type CategorySelection = {
  parentId: string | null;
  subId: string | null;
};

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

function Checkbox({ checked, colors }: { checked: boolean; colors: ThemeColors }) {
  return (
    <View
      style={[
        checkboxStyles.box,
        { borderColor: colors.borderMid || colors.borderSoft },
        checked && { backgroundColor: colors.electricBright, borderColor: colors.electricBright },
      ]}
    >
      {checked ? <AppIcon name="checkmark" size={12} color="#fff" /> : null}
    </View>
  );
}

const checkboxStyles = StyleSheet.create({
  box: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

export function MarketCategoryPicker({
  visible,
  categories,
  selection,
  onClose,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { styles, colors } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors),
    colors: theme.colors,
  }));

  const [draft, setDraft] = useState<CategorySelection>(selection);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      setDraft(selection);
      const next = new Set<string>();
      if (selection.parentId) next.add(selection.parentId);
      setExpandedIds(next);
    }
  }, [visible, selection]);

  const parents = useMemo(
    () => categories.filter((c) => c.isActive !== false).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );

  const sheetMaxHeight = Math.min(windowHeight * 0.86, 720);

  const toggleExpanded = (parentId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  const selectParentOnly = (parentId: string) => {
    setDraft({ parentId, subId: null });
  };

  const selectSub = (parentId: string, subId: string) => {
    setDraft({ parentId, subId });
  };

  const apply = () => {
    onSelect(draft);
    onClose();
  };

  const reset = () => {
    setDraft({ parentId: null, subId: null });
  };

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
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
              <Text style={styles.closeText}>إغلاق</Text>
            </Pressable>
            <Text style={styles.title}>التصنيف</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {parents.length === 0 ? (
              <Text style={styles.empty}>لا توجد تصنيفات</Text>
            ) : (
              parents.map((parent) => {
                const subs = (parent.children ?? []).filter((c) => c.isActive !== false);
                const expanded = expandedIds.has(parent.id);
                const parentAllChecked =
                  draft.parentId === parent.id && draft.subId === null;

                return (
                  <View key={parent.id} style={styles.section}>
                    <Pressable
                      style={[styles.sectionHeader, getRtlRow()]}
                      onPress={() => {
                        if (subs.length > 0) toggleExpanded(parent.id);
                        else selectParentOnly(parent.id);
                      }}
                      accessibilityRole="button"
                    >
                      {subs.length > 0 ? (
                        <AppIcon
                          name={expanded ? 'angle-up' : 'angle-down'}
                          size={16}
                          color={colors.textMuted}
                        />
                      ) : (
                        <View style={styles.headerSpacer} />
                      )}
                      <Text style={styles.sectionTitle} numberOfLines={2}>
                        {parent.nameAr}
                      </Text>
                      {subs.length === 0 ? (
                        <Checkbox checked={parentAllChecked} colors={colors} />
                      ) : (
                        <View style={styles.headerSpacer} />
                      )}
                    </Pressable>

                    {expanded && subs.length > 0 ? (
                      <View style={styles.subList}>
                        <Pressable
                          style={[styles.subRow, getRtlRow()]}
                          onPress={() => selectParentOnly(parent.id)}
                        >
                          <Checkbox checked={parentAllChecked} colors={colors} />
                          <Text
                            style={[
                              styles.subLabel,
                              parentAllChecked && styles.subLabelActive,
                            ]}
                          >
                            الكل
                          </Text>
                        </Pressable>
                        {subs.map((sub) => {
                          const checked =
                            draft.parentId === parent.id && draft.subId === sub.id;
                          return (
                            <Pressable
                              key={sub.id}
                              style={[styles.subRow, getRtlRow()]}
                              onPress={() => selectSub(parent.id, sub.id)}
                            >
                              <Checkbox checked={checked} colors={colors} />
                              <Text style={[styles.subLabel, checked && styles.subLabelActive]}>
                                {sub.nameAr}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}

                    <View style={styles.sectionDivider} />
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={[styles.footer, getRtlRow()]}>
            <Pressable style={styles.applyBtn} onPress={apply} accessibilityLabel="تطبيق">
              <Text style={styles.applyText}>تطبيق</Text>
            </Pressable>
            <Pressable style={styles.resetBtn} onPress={reset} accessibilityLabel="إعادة تعيين">
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
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    closeText: {
      ...typography.bodyStrong,
      color: colors.electricBright,
      minWidth: 48,
      writingDirection: 'rtl',
    },
    title: {
      ...typography.cardHeading,
      fontSize: 18,
      color: colors.textPrimary,
      textAlign: 'center',
      writingDirection: 'rtl',
    },
    headerSpacer: {
      width: 48,
    },
    scroll: {
      paddingBottom: spacing.sm,
    },
    empty: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.xl,
      writingDirection: 'rtl',
    },
    section: {
      width: '100%',
    },
    sectionHeader: {
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    sectionTitle: {
      flex: 1,
      ...typography.bodyStrong,
      color: colors.textPrimary,
      writingDirection: 'rtl',
    },
    parentAllTap: {
      padding: 4,
    },
    subList: {
      paddingBottom: spacing.xs,
    },
    subRow: {
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      paddingEnd: spacing.xl,
    },
    subLabel: {
      flex: 1,
      ...typography.body,
      color: colors.textSecondary,
      writingDirection: 'rtl',
    },
    subLabelActive: {
      color: colors.electricBright,
    },
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderHairline || colors.borderSoft,
      marginHorizontal: spacing.lg,
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
      borderRadius: 10,
      backgroundColor: colors.electricBright,
      alignItems: 'center',
      justifyContent: 'center',
    },
    applyText: {
      ...typography.bodyStrong,
      color: '#FFFFFF',
    },
    resetBtn: {
      flex: 1,
      minHeight: 50,
      borderRadius: 10,
      backgroundColor: colors.bgSurface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resetText: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
    },
  });
}

export default MarketCategoryPicker;
