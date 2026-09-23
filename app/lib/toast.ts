export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type ToastPayload = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastRequest = ToastPayload & {
  resolve: () => void;
};

let seq = 0;
let current: ToastRequest | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeToast(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToastState(): ToastPayload | null {
  if (!current) return null;
  const { resolve: _r, ...rest } = current;
  return rest;
}

export function showToast(message: string, type: ToastType = 'success', durationMs = 2600) {
  if (current) current.resolve();
  return new Promise<void>((resolve) => {
    current = { id: ++seq, message, type, resolve };
    notify();
    setTimeout(() => {
      if (current?.id === seq) dismissToast();
      resolve();
    }, durationMs);
  });
}

export function dismissToast() {
  if (!current) return;
  const { resolve } = current;
  current = null;
  notify();
  resolve();
}
