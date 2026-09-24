require('react-native-gesture-handler');

// Custom entry — patches dev-runtime issues before expo-router loads.
if (__DEV__) {
  const { LogBox } = require('react-native');

  LogBox.ignoreLogs([
    'source.uri should not be an empty string',
    'Unable to activate keep awake',
  ]);

  try {
    const ExpoKeepAwake = require('expo-keep-awake/src/ExpoKeepAwake').default;
    if (ExpoKeepAwake?.activate && !ExpoKeepAwake.activate.__safatPatched) {
      const originalActivate = ExpoKeepAwake.activate.bind(ExpoKeepAwake);
      ExpoKeepAwake.activate = async (tag) => {
        try {
          return await originalActivate(tag);
        } catch {
          // Activity may not be ready yet inside Modal/dev client.
        }
      };
      ExpoKeepAwake.activate.__safatPatched = true;
    }
  } catch {}

  try {
    const keepAwake = require('expo-keep-awake');
    if (keepAwake?.activateKeepAwakeAsync && !keepAwake.activateKeepAwakeAsync.__safatPatched) {
      const original = keepAwake.activateKeepAwakeAsync.bind(keepAwake);
      keepAwake.activateKeepAwakeAsync = async (tag) => {
        try {
          await original(tag);
        } catch {
          // Expo dev client may call keep-awake before Android Activity is ready.
        }
      };
      keepAwake.activateKeepAwakeAsync.__safatPatched = true;
    }
  } catch {}

  const prev = globalThis.onunhandledrejection;
  globalThis.onunhandledrejection = (event) => {
    const msg = event?.reason?.message ?? String(event?.reason ?? '');
    if (msg.includes('Unable to activate keep awake')) {
      event.preventDefault?.();
      return;
    }
    prev?.(event);
  };
}

// RTL policy: one global React Native direction (forceRTL + swapLeftAndRightInRTL).
// left/right and textAlign left/right are LOGICAL under swap — do not add
// textAlign:'right', direction:'ltr', or row-reverse to "fix" Arabic.
// Use AppText / SarhInput / flexDirection:'row' / start-end helpers.
// See app/lib/rtl.ts.
// On web, react-native-web's I18nManager is a no-op stub (isRTL always false),
// so we patch it and set <html dir="rtl"> before expo-router boots.
const { I18nManager, Platform } = require('react-native');
if (Platform.OS === 'web') {
  let webIsRtl = true;
  I18nManager.allowRTL = function allowRTL() {};
  I18nManager.forceRTL = function forceRTL(value) {
    webIsRtl = !!value;
  };
  I18nManager.swapLeftAndRightInRTL = function swapLeftAndRightInRTL() {};
  I18nManager.getConstants = function getConstants() {
    return { isRTL: webIsRtl };
  };
  try {
    Object.defineProperty(I18nManager, 'isRTL', {
      configurable: true,
      enumerable: true,
      get: function getIsRTL() {
        return webIsRtl;
      },
    });
  } catch {
    I18nManager.isRTL = true;
  }
  I18nManager.forceRTL(true);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('lang', 'ar');
    if (document.body) document.body.style.direction = 'rtl';
  }
} else {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
  I18nManager.swapLeftAndRightInRTL(true);
}

require('expo-router/entry');
