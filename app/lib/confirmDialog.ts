/**
 * Shared in-app dialog (iOS alert style), the drop-in replacement for raw
 * `Alert.alert` in app UI. Same call shape: title, message, buttons
 * `{ text, style, onPress }`. Rendered by `ConfirmDialogHost` (mounted with the
 * global action-sheet host), so it looks the same on iOS, Android and web.
 */
export type DialogButtonStyle = 'default' | 'cancel' | 'destructive';

export type DialogButton = {
  text?: string;
  style?: DialogButtonStyle;
  onPress?: () => void;
};

export type DialogOptions = {
  /** Tap outside / Android back closes (only when a cancel button exists). */
  cancelable?: boolean;
  onDismiss?: () => void;
};

export type DialogRequest = {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  options?: DialogOptions;
};

const queue: DialogRequest[] = [];
const listeners = new Set<() => void>();
let seq = 0;

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeDialog(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDialogState(): DialogRequest | null {
  return queue[0] ?? null;
}

/** Default «حسناً» when no buttons are given, like Alert.alert. */
export function normalizeDialogButtons(buttons?: DialogButton[]): DialogButton[] {
  const list = (buttons ?? []).filter(Boolean);
  if (list.length === 0) return [{ text: 'حسناً', style: 'default' }];
  return list.map((b) => ({ ...b, text: b.text ?? 'حسناً' }));
}

/** Two buttons sit side by side (cancel first), three or more stack. */
export function dialogLayout(buttons: DialogButton[]): 'row' | 'column' {
  return buttons.length === 2 ? 'row' : 'column';
}

/** Order for display: in a row the cancel button sits first (start side). */
export function orderDialogButtons(buttons: DialogButton[]): DialogButton[] {
  if (dialogLayout(buttons) !== 'row') return buttons;
  const cancel = buttons.filter((b) => b.style === 'cancel');
  const rest = buttons.filter((b) => b.style !== 'cancel');
  return [...cancel, ...rest];
}

export function showAlert(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  options?: DialogOptions,
): void {
  seq += 1;
  queue.push({ id: seq, title, message, buttons: normalizeDialogButtons(buttons), options });
  notify();
}

/** Close the visible dialog; `button` runs after it is removed. */
export function resolveDialog(id: number, button: DialogButton | null) {
  const current = queue[0];
  if (!current || current.id !== id) return;
  queue.shift();
  notify();
  if (button) button.onPress?.();
  else current.options?.onDismiss?.();
}

/** Promise confirm: resolves true on the confirm button, false otherwise. */
export function presentConfirm(params: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    showAlert(
      params.title,
      params.message,
      [
        { text: params.cancelLabel ?? 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
        {
          text: params.confirmLabel ?? 'تأكيد',
          style: params.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Test-only reset. */
export function __resetDialogsForTest() {
  queue.length = 0;
  seq = 0;
}
