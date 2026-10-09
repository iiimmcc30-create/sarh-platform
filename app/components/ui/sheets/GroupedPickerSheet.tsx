import { useEffect, useState, type ReactNode } from 'react';
import {
  Pressable,
  SectionList,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { SheetModal } from '@/components/ui/SheetModal';
import { SheetSurface } from '@/components/ui/sheets/SheetSurface';
import { SheetRow } from '@/components/ui/sheets/SheetRow';
import { SHEET_GUTTER } from '@/components/ui/sheets/sheetLayout';
import { AppText } from '@/design-system/components';
import { radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow } from '@/lib/rtl';

export type GroupedPickerRow = {
  key: string;
  label: string;
  subtitle?: string;
  icon?: string;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
};

export type GroupedPickerSection = {
  key: string;
  /** Small grey header (omit for the top rows). */
  title?: string;
  rows: GroupedPickerRow[];
};

type Props = {
  visible: boolean;
  title: string;
  searchPlaceholder: string;
  query: string;
  onQueryChange: (q: string) => void;
  sections: GroupedPickerSection[];
  onClose: () => void;
  /** «إعادة تعيين»: clears the filter (the caller applies and closes). */
  onReset: () => void;
  resetDisabled?: boolean;
  emptyText?: string;
  testID?: string;
  footer?: ReactNode;
};

/**
 * Large iOS-style picker on the shared sheet system: near full height, grabber, drag
 * to dismiss (SheetModal, native-driver Animated), sticky search, grouped sections with
 * small grey headers, 54pt SheetRows with a checkmark and hairline separators.
 * Picking a row applies and closes (no Apply step).
 */
export function GroupedPickerSheet({
  visible,
  title,
  searchPlaceholder,
  query,
  onQueryChange,
  sections,
  onClose,
  onReset,
  resetDisabled = false,
  emptyText = 'لا توجد نتائج',
  testID,
  footer,
}: Props) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const [mountedQuery, setMountedQuery] = useState(query);
  useEffect(() => setMountedQuery(query), [query]);

  return (
    <SheetModal visible={visible} onClose={onClose} keyboardAvoiding testID={testID}>
      <SheetSurface style={[styles.surface, { height: Math.round(height * 0.92) }]}>
        <View style={[styles.header, getRtlRow()]}>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
            style={styles.headerSide}
            testID={testID ? `${testID}-close` : undefined}
          >
            <AppText variant="body" color="textSecondary">
              إغلاق
            </AppText>
          </Pressable>
          <AppText variant="label" align="center" style={styles.headerTitle} numberOfLines={1}>
            {title}
          </AppText>
          <Pressable
            onPress={onReset}
            disabled={resetDisabled}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="إعادة تعيين"
            accessibilityState={{ disabled: resetDisabled }}
            style={[styles.headerSide, styles.headerSideEnd]}
            testID={testID ? `${testID}-reset` : undefined}
          >
            <AppText variant="body" color={resetDisabled ? 'textMuted' : 'textPrimary'}>
              إعادة تعيين
            </AppText>
          </Pressable>
        </View>

        <View
          style={[
            styles.search,
            getRtlRow(),
            { backgroundColor: colors.bgElevated, borderColor: colors.borderSoft },
          ]}
        >
          <AppIcon name="search" size={17} color={colors.textMuted} />
          <TextInput
            value={mountedQuery}
            onChangeText={(t) => {
              setMountedQuery(t);
              onQueryChange(t);
            }}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.textPrimary }]}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={searchPlaceholder}
            testID={testID ? `${testID}-search` : undefined}
          />
          {mountedQuery ? (
            <Pressable
              onPress={() => {
                setMountedQuery('');
                onQueryChange('');
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="مسح البحث"
            >
              <AppIcon name="close-circle" size={17} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <SectionList
          sections={sections.map((s) => ({ ...s, data: s.rows }))}
          keyExtractor={(row) => row.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickySectionHeadersEnabled={false}
          initialNumToRender={20}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) =>
            section.title ? (
              <View style={styles.sectionHeader}>
                <AppText variant="caption" color="textMuted">
                  {section.title}
                </AppText>
              </View>
            ) : (
              <View style={styles.sectionGap} />
            )
          }
          renderItem={({ item, index, section }) => (
            <SheetRow
              label={item.label}
              subtitle={item.subtitle}
              icon={item.icon}
              selected={item.selected}
              showDivider={index < section.data.length - 1}
              onPress={item.onPress}
              testID={item.testID}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText variant="body" color="textMuted" align="center">
                {emptyText}
              </AppText>
            </View>
          }
          ListFooterComponent={footer ? <View>{footer}</View> : null}
        />
      </SheetSurface>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  surface: { maxHeight: '100%' },
  header: {
    minHeight: 44,
    paddingHorizontal: SHEET_GUTTER + 4,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSide: { minWidth: 84 },
  headerSideEnd: { alignItems: 'flex-end' },
  headerTitle: { flex: 1 },
  search: {
    marginHorizontal: SHEET_GUTTER,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    minHeight: 40,
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
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.lg },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: spacing.md,
    paddingBottom: 6,
  },
  sectionGap: { height: 0 },
  empty: { paddingVertical: spacing.xl },
});

export default GroupedPickerSheet;
