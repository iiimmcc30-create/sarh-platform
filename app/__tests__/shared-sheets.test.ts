import { readFileSync } from 'fs';
import path from 'path';
import {
  SHEET_RADIUS,
  SHEET_ROW_HEIGHT,
  sheetBottomPadding,
  sheetRowAccessory,
  splitSheetItems,
} from '../components/ui/sheets/sheetLayout';
import {
  __resetDialogsForTest,
  dialogLayout,
  getDialogState,
  normalizeDialogButtons,
  orderDialogButtons,
  presentConfirm,
  resolveDialog,
  showAlert,
} from '../lib/confirmDialog';
import {
  closeActionSheet,
  confirmDestructive,
  getActionSheetState,
  presentOptionPicker,
} from '../lib/actionSheet';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('sheet layout rules', () => {
  it('uses iOS proportions', () => {
    expect(SHEET_RADIUS).toBeGreaterThanOrEqual(20);
    expect(SHEET_RADIUS).toBeLessThanOrEqual(24);
    expect(SHEET_ROW_HEIGHT).toBeGreaterThanOrEqual(52);
    expect(SHEET_ROW_HEIGHT).toBeLessThanOrEqual(56);
  });

  it('pads inside the surface for the home indicator, with a base on flat-bottom devices', () => {
    expect(sheetBottomPadding(34)).toBe(38);
    expect(sheetBottomPadding(0)).toBe(12);
    expect(sheetBottomPadding(Number.NaN)).toBe(12);
  });

  it('splits cancel into its own group', () => {
    const { actions, cancel } = splitSheetItems([
      { key: 'a' },
      { key: 'c', cancel: true },
      { key: 'b' },
    ]);
    expect(actions.map((i) => i.key)).toEqual(['a', 'b']);
    expect(cancel?.key).toBe('c');
    expect(splitSheetItems([{ key: 'a' }]).cancel).toBeNull();
  });

  it('shows a checkmark only on the selected picker option', () => {
    expect(sheetRowAccessory({ pickerMode: true, selected: true })).toBe('check');
    expect(sheetRowAccessory({ pickerMode: true, selected: false })).toBe('none');
    expect(sheetRowAccessory({ pickerMode: false, selected: true })).toBe('none');
  });
});

describe('confirm dialog store', () => {
  beforeEach(() => __resetDialogsForTest());

  it('defaults to a single «حسناً» like Alert.alert', () => {
    expect(normalizeDialogButtons()).toEqual([{ text: 'حسناً', style: 'default' }]);
  });

  it('puts two buttons side by side with cancel first, stacks three', () => {
    const two = [{ text: 'حذف', style: 'destructive' as const }, { text: 'إلغاء', style: 'cancel' as const }];
    expect(dialogLayout(two)).toBe('row');
    expect(orderDialogButtons(two).map((b) => b.text)).toEqual(['إلغاء', 'حذف']);
    const three = [{ text: 'a' }, { text: 'b' }, { text: 'c' }];
    expect(dialogLayout(three)).toBe('column');
    expect(orderDialogButtons(three)).toBe(three);
  });

  it('queues dialogs and runs the pressed button after closing', () => {
    const pressed = jest.fn();
    showAlert('أول', undefined, [{ text: 'تم', onPress: pressed }]);
    showAlert('ثاني');
    const first = getDialogState()!;
    expect(first.title).toBe('أول');
    resolveDialog(first.id, first.buttons[0]);
    expect(pressed).toHaveBeenCalledTimes(1);
    expect(getDialogState()!.title).toBe('ثاني');
  });

  it('presentConfirm resolves true on confirm and false on dismiss', async () => {
    const yes = presentConfirm({ title: 'حذف؟', destructive: true, confirmLabel: 'حذف' });
    const d1 = getDialogState()!;
    expect(d1.buttons[1]).toMatchObject({ text: 'حذف', style: 'destructive' });
    resolveDialog(d1.id, d1.buttons[1]);
    await expect(yes).resolves.toBe(true);

    const no = presentConfirm({ title: 'متأكد؟' });
    resolveDialog(getDialogState()!.id, null);
    await expect(no).resolves.toBe(false);
  });
});

describe('action sheet + option picker', () => {
  it('option picker marks the current option and appends a cancel', async () => {
    const pick = presentOptionPicker({
      title: 'من يمكنه مراسلتي',
      options: [
        { key: 'everyone', label: 'الجميع' },
        { key: 'followers', label: 'متابعيني' },
      ],
      selectedKey: 'followers',
    });
    const state = getActionSheetState()!;
    expect(state.selectedKey).toBe('followers');
    expect(state.items[state.items.length - 1]).toMatchObject({ key: 'cancel', cancel: true });
    closeActionSheet('everyone');
    await expect(pick).resolves.toBe('everyone');
  });

  it('confirmDestructive resolves false on cancel', async () => {
    const p = confirmDestructive('تسجيل الخروج', 'متأكد؟', 'خروج');
    closeActionSheet('cancel');
    await expect(p).resolves.toBe(false);
  });
});

describe('shared sheet components (source contracts)', () => {
  it('the action sheet host is flat (no gradients) and groups cancel separately', () => {
    const host = src('components/ui/ActionSheetHost.tsx');
    expect(host).not.toContain('LinearGradient');
    expect(host).toContain('<SheetSurface');
    expect(host).toContain('<SheetGroup');
    expect(host).toContain('splitSheetItems');
    expect(host).toContain('<ConfirmDialogHost');
  });

  it('the surface reaches the bottom edge and pads inside it', () => {
    const surface = src('components/ui/sheets/SheetSurface.tsx');
    expect(surface).toContain('sheetBottomPadding(insets.bottom)');
    expect(surface).toContain('backgroundColor: colors.bgSurface');
    expect(src('components/ui/SheetModal.tsx')).toContain('navigationBarTranslucent');
  });

  it('rows: muted-red destructive, checkmark, RN Animated only', () => {
    const row = src('components/ui/sheets/SheetRow.tsx');
    expect(row).toContain('colors.danger');
    expect(row).toContain('checkmark');
    for (const f of ['components/ui/sheets/SheetRow.tsx', 'components/ui/ConfirmDialogHost.tsx', 'components/ui/sheets/SheetSurface.tsx']) {
      expect(src(f)).not.toMatch(/react-native-reanimated|react-native-gesture-handler|LinearGradient/);
    }
  });

  it('migrated sheets render on the shared surface', () => {
    for (const f of [
      'components/councils/CouncilSheet.tsx',
      'components/ui/VerifiedInfoSheet.tsx',
      'components/listing/ListingContactSheet.tsx',
      'components/listing/PromotionStatsSheet.tsx',
      'components/feature/RatingModal.tsx',
      'components/market/MarketCategoryPicker.tsx',
      'components/market/RegionCityPicker.tsx',
      'components/listing/ListingFeePaymentSheet.tsx',
      'components/live/LiveBroadcastPledgeModal.tsx',
      'components/feature/chat/ChatActionsSheet.tsx',
      'components/listing/ListingDeleteDialog.tsx',
    ]) {
      expect({ f, ok: src(f).includes('<SheetSurface') }).toEqual({ f, ok: true });
    }
  });

  it('in-app UI uses the shared dialog instead of raw Alert.alert', () => {
    for (const f of [
      'app/chat.tsx',
      'app/listing/[id].tsx',
      'app/users/[id].tsx',
      'app/create/post.tsx',
      'lib/confirmSignOut.ts',
      'components/market/MarketListingsFeed.tsx',
      'components/listing/ListingVideoSection.tsx',
    ]) {
      expect({ f, raw: src(f).includes('Alert.alert(') }).toEqual({ f, raw: false });
    }
  });
});
