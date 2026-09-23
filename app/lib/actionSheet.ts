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

export async function alertMessage(title: string, message?: string, icon = 'information-circle-outline') {
  await presentActionSheet({
    title,
    message,
    items: [{ key: 'ok', label: 'حسناً', cancel: true, icon }],
  });
}
