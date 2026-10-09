import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SheetModal } from '@/components/ui/SheetModal';
import { SheetGroup } from '@/components/ui/sheets/SheetGroup';
import { SheetRow } from '@/components/ui/sheets/SheetRow';
import { SheetSurface } from '@/components/ui/sheets/SheetSurface';
import { splitSheetItems } from '@/components/ui/sheets/sheetLayout';
import { ConfirmDialogHost } from '@/components/ui/ConfirmDialogHost';
import {
  closeActionSheet,
  getActionSheetState,
  subscribeActionSheet,
} from '@/lib/actionSheet';

/**
 * Global host — mount once in root layout so action sheets, option pickers and
 * in-app dialogs work on web + native. iOS-style: the surface sits flush on the
 * bottom edge, actions in one rounded group, «إلغاء» in its own group below.
 */
export function ActionSheetHost() {
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeActionSheet(() => setTick((n) => n + 1)), []);

  const live = getActionSheetState();
  // Keep the last request on screen while the sheet slides away.
  const lastRef = useRef(live);
  if (live) lastRef.current = live;
  const state = live ?? lastRef.current;
  const visible = !!live;
  void tick;

  const { actions, cancel } = splitSheetItems(state?.items ?? []);
  const pickerMode = state?.selectedKey !== undefined && state?.selectedKey !== null;

  return (
    <>
      <SheetModal visible={visible} onClose={() => closeActionSheet(null)}>
        <SheetSurface title={state?.title} message={state?.message} testID="action-sheet">
          <View style={styles.body}>
            {actions.length > 0 ? (
              <SheetGroup>
                {actions.map((item, index) => (
                  <SheetRow
                    key={item.key}
                    label={item.label}
                    subtitle={item.subtitle}
                    icon={pickerMode ? undefined : item.icon}
                    destructive={item.destructive}
                    selected={pickerMode && state?.selectedKey === item.key}
                    showDivider={index < actions.length - 1}
                    onPress={() => closeActionSheet(item.key)}
                    testID={`action-sheet-item-${item.key}`}
                  />
                ))}
              </SheetGroup>
            ) : null}
            {cancel ? (
              <SheetGroup>
                <SheetRow
                  label={cancel.label}
                  cancel
                  onPress={() => closeActionSheet(null)}
                  testID="action-sheet-cancel"
                />
              </SheetGroup>
            ) : null}
          </View>
        </SheetSurface>
      </SheetModal>
      <ConfirmDialogHost />
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10, paddingTop: 2 },
});
