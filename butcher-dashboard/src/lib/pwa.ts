export const INSTALL_DISMISS_KEY = 'sarh_pwa_install_dismissed';
export const INSTALL_SUCCESS_KEY = 'sarh_pwa_installed';

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const media =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = 'standalone' in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return media || iosStandalone;
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export function shouldShowIosInstallHelp(): boolean {
  return isIosDevice() && !isStandaloneDisplay();
}

export function wasInstallDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(INSTALL_DISMISS_KEY) === '1';
}

export function dismissInstallPrompt(): void {
  window.localStorage.setItem(INSTALL_DISMISS_KEY, '1');
}

export function markInstalled(): void {
  window.localStorage.setItem(INSTALL_SUCCESS_KEY, '1');
}

export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}
