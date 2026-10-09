import { showAlert } from './confirmDialog';

export type ActionSheetItem = {
  key: string;
  label: string;
  subtitle?: string;
  icon?: string;
  destructive?: boolean;
  cancel?: boolean;
};

type SheetRequest = {
  title: string;
  message?: string;
  items: ActionSheetItem[];
  /** Picker mode: the current option shows a checkmark (no chevrons). */
  selectedKey?: string | null;
  resolve: (key: string | null) => void;
};

let current: SheetRequest | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeActionSheet(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActionSheetState(): Omit<SheetRequest, 'resolve'> | null {
  if (!current) return null;
  const { resolve: _r, ...rest } = current;
  return rest;
}

export function presentActionSheet(options: {
  title: string;
  message?: string;
  items: ActionSheetItem[];
  selectedKey?: string | null;
}): Promise<string | null> {
  return new Promise((resolve) => {
    if (current) {
      current.resolve(null);
    }
    current = { ...options, resolve };
    notify();
  });
}

export function closeActionSheet(key: string | null) {
  if (!current) return;
  const { resolve } = current;
  current = null;
  notify();
  resolve(key);
}

export async function confirmDestructive(
  title: string,
  message: string,
  confirmLabel = 'حذف',
): Promise<boolean> {
  const key = await presentActionSheet({
    title,
    message,
    items: [
      { key: 'confirm', label: confirmLabel, destructive: true },
      { key: 'cancel', label: 'إلغاء', cancel: true },
    ],
  });
  return key === 'confirm';
}

/**
 * Option picker (iOS-style): the shared sheet with a checkmark on the current
 * option and a separate «إلغاء» group. Resolves the picked key, or null.
 */
export function presentOptionPicker(options: {
  title: string;
  message?: string;
  options: Array<{ key: string; label: string; subtitle?: string }>;
  selectedKey?: string | null;
}): Promise<string | null> {
  return presentActionSheet({
    title: options.title,
    message: options.message,
    selectedKey: options.selectedKey ?? null,
    items: [
      ...options.options.map((o) => ({ key: o.key, label: o.label, subtitle: o.subtitle })),
      { key: 'cancel', label: 'إلغاء', cancel: true },
    ],
  });
}

/** In-app notice: the shared centered dialog with a single «حسناً». */
export async function alertMessage(title: string, message?: string, _icon?: string) {
  await new Promise<void>((resolve) => {
    showAlert(title, message, [{ text: 'حسناً', onPress: () => resolve() }], {
      onDismiss: () => resolve(),
    });
  });
}
