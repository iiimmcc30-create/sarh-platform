/**
 * RTL policy (Sarh, Arabic default)
 * --------------------------------
 * One system only: React Native I18nManager.
 *   allowRTL(true) + forceRTL(localeUsesRtl) + swapLeftAndRightInRTL(same)
 *   Stack contentStyle uses direction: 'rtl' | 'ltr' via getRtlDirection().
 *
 * Under swap, style left/right and textAlign left/right are LOGICAL:
 *   physical-edge textAlign becomes the opposite visual side — never use it as a fix.
 *   flexDirection:'row' already starts at the inline start (right in ar).
 *
 * Allowed in screens: AppText, SarhInput, flexDirection:'row',
 * start/end helpers (marginStart, paddingEnd, …), textAlign:'center'.
 *
 * Forbidden as RTL workarounds: LTR islands, reversed rows,
 * alignSelf flex-end to shove Arabic, new RtlTextShell wrappers.
 *
 * RtlText / RtlTextShell / getRtlBlockTextStyle are deprecated leftovers
 * of the old dual system. Do not use them in new UI.
 */
import { I18nManager, Platform, type TextStyle, type ViewStyle } from 'react-native';
import {
  DEFAULT_LOCALE,
  type AppLocale,
  localeUsesRtl,
  LOCALE_STORAGE_KEY,
  normalizeAppLocale,
} from '@/lib/locale';

/** Locale-driven RTL flag — required on web where I18nManager is a no-op stub. */
let activeRtl = localeUsesRtl(DEFAULT_LOCALE);
let activeLocale: AppLocale = DEFAULT_LOCALE;

function applyDocumentDirection(locale: AppLocale, rtl: boolean) {
  if (Platform.OS !== 'web') return;
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  root.setAttribute('lang', locale === 'ar' ? 'ar' : 'en');
  if (document.body) {
    document.body.style.direction = rtl ? 'rtl' : 'ltr';
  }
}

/**
 * Patch react-native-web's I18nManager stub so Expo Router / React Navigation
 * read isRTL=true (their default direction comes from getConstants().isRTL).
 */
export function patchWebI18nManager(rtl: boolean): void {
  if (Platform.OS !== 'web') return;
  const mgr = I18nManager as unknown as {
    allowRTL?: (v: boolean) => void;
    forceRTL?: (v: boolean) => void;
    swapLeftAndRightInRTL?: (v: boolean) => void;
    getConstants?: () => { isRTL: boolean };
    isRTL?: boolean;
  };

  mgr.allowRTL = () => undefined;
  mgr.forceRTL = (value: boolean) => {
    activeRtl = !!value;
    try {
      Object.defineProperty(mgr, 'isRTL', {
        configurable: true,
        enumerable: true,
        get: () => activeRtl,
      });
    } catch {
      mgr.isRTL = activeRtl;
    }
  };
  mgr.swapLeftAndRightInRTL = () => undefined;
  mgr.getConstants = () => ({ isRTL: activeRtl });
  mgr.forceRTL(rtl);
}

/** Read layout direction — locale-backed on web, I18nManager on native. */
export function isAppRtl(): boolean {
  if (Platform.OS === 'web') return activeRtl;
  return !!I18nManager.isRTL;
}

/** @deprecated Use `isAppRtl()` — kept for existing imports. */
export const isRTL = activeRtl;

/**
 * Configure RTL/LTR via official I18nManager (native) + document dir (web).
 * Call once before the app bundle renders (see `index.js`).
 */
export function setupRtl(locale: AppLocale = DEFAULT_LOCALE): void {
  const rtl = localeUsesRtl(locale);
  if (activeLocale === locale && activeRtl === rtl) {
    if (Platform.OS === 'web') {
      applyDocumentDirection(locale, rtl);
      return;
    }
    if (I18nManager.isRTL === rtl) return;
  }
  activeLocale = locale;
  activeRtl = rtl;

  if (Platform.OS === 'web') {
    patchWebI18nManager(rtl);
    applyDocumentDirection(locale, rtl);
    return;
  }

  I18nManager.allowRTL(true);
  I18nManager.forceRTL(rtl);
  I18nManager.swapLeftAndRightInRTL(rtl);
}

/** Apply stored locale on cold start (async). May require reload if direction changes. */
export async function setupRtlFromStorage(
  getItem: (key: string) => Promise<string | null>,
): Promise<AppLocale> {
  const stored = normalizeAppLocale(await getItem(LOCALE_STORAGE_KEY));
  setupRtl(stored);
  return stored;
}

export function getActiveLocale(): AppLocale {
  return activeLocale;
}

/** Root / screen layout direction for the active locale. */
export function getRtlDirection(): ViewStyle {
  return { direction: isAppRtl() ? 'rtl' : 'ltr' };
}

/**
 * Logical row. `flexDirection: 'row'` plus the same `direction` as the root
 * (not row-reverse). Needed on web: RN-web does not always inherit document
 * dir onto a View, so a bare `row` can paint LTR. Do not add LTR islands here.
 */
export function getRtlRow(): ViewStyle {
  return { flexDirection: 'row', ...getRtlDirection() };
}

/**
 * Script direction only. No textAlign — Yoga/I18nManager owns alignment.
 * Prefer `AppText` over spreading this onto raw Text.
 */
export function getRtlText(): TextStyle {
  return isAppRtl()
    ? { writingDirection: 'rtl' }
    : { writingDirection: 'ltr' };
}

export type PhysicalLtrShellOptions = {
  /** `flex: 1` + `minWidth: 0` for text inside a horizontal row. Default: full-width block. */
  flex?: boolean;
};

/**
 * @deprecated No longer an LTR island. Width/flex only — same RTL model as the root.
 */
export function getPhysicalLtrShellStyle(options?: PhysicalLtrShellOptions): ViewStyle {
  const flex = options?.flex ?? false;
  if (flex) {
    return { flex: 1, minWidth: 0 };
  }
  return { width: '100%' };
}

export type CoverTrailRowOptions = {
  flex?: boolean;
  justifyContent?: ViewStyle['justifyContent'];
  gap?: number;
};

/**
 * Logical cover row — same model as getRtlRow().
 * CoverTrailRow remaps leftover flex-end + reverse children so old
 * [text, icon] call sites still place the icon at inline start.
 */
export function getCoverTrailRowStyle(options?: CoverTrailRowOptions): ViewStyle {
  const justify = options?.justifyContent === 'flex-end' ? 'flex-start' : options?.justifyContent;
  return {
    ...getRtlRow(),
    alignItems: 'center',
    minWidth: 0,
    ...(options?.flex ? { flex: 1 } : null),
    ...(justify ? { justifyContent: justify } : null),
    ...(options?.gap != null ? { gap: options.gap } : null),
  };
}

/**
 * Block text bounds only. No physical textAlign — same model as AppText.
 */
export function getRtlBlockTextStyle(): TextStyle {
  return { width: '100%', ...getRtlText() };
}

/** Cross-axis alignment at inline start (Yoga logical). */
export function alignInlineStart(): ViewStyle {
  return { alignItems: 'flex-start' };
}

/** Cross-axis alignment at inline end. */
export function alignInlineEnd(): ViewStyle {
  return { alignItems: 'flex-end' };
}

/** Self alignment at inline end. */
export function selfInlineEnd(): ViewStyle {
  return { alignSelf: 'flex-end' };
}

export function inlineStart(offset: number): ViewStyle {
  return { start: offset };
}

export function inlineEnd(offset: number): ViewStyle {
  return { end: offset };
}

export function positionInlineStart(value: number | `${number}%`): ViewStyle {
  return { start: value };
}

export function positionInlineEnd(value: number | `${number}%`): ViewStyle {
  return { end: value };
}

export function marginStart(value: number): ViewStyle {
  return { marginStart: value };
}

export function marginEnd(value: number): ViewStyle {
  return { marginEnd: value };
}

export function marginAutoStart(): ViewStyle {
  return { marginStart: 'auto' };
}

export function marginAutoEnd(): ViewStyle {
  return { marginEnd: 'auto' };
}

export function paddingStart(value: number): ViewStyle {
  return { paddingStart: value };
}

export function paddingEnd(value: number): ViewStyle {
  return { paddingEnd: value };
}

export function borderInlineStart(width: number, color: string): ViewStyle {
  return { borderStartWidth: width, borderStartColor: color };
}

export function borderInlineEnd(width: number, color: string): ViewStyle {
  return { borderEndWidth: width, borderEndColor: color };
}

export function bubbleTailRadius(isOwn: boolean): ViewStyle {
  if (isOwn) {
    return isAppRtl()
      ? { borderBottomLeftRadius: 4 }
      : { borderBottomRightRadius: 4 };
  }
  return isAppRtl()
    ? { borderBottomRightRadius: 4 }
    : { borderBottomLeftRadius: 4 };
}

export function rtlBackIcon(): string {
  return isAppRtl() ? 'arrow-forward' : 'arrow-back';
}

export function rtlForwardIcon(): string {
  return isAppRtl() ? 'angle-left' : 'angle-right';
}

/** Arabic fields — writing direction only; do not set textAlign. */
export const rtlInputText: TextStyle = {
  writingDirection: 'rtl',
};

/** Latin / numeric typing — writing direction only. */
export const ltrInputText: TextStyle = {
  writingDirection: 'ltr',
};

export const rtlTextInputProps = {
  writingDirection: 'rtl' as const,
};

/** Stack / modal slide animation for the active layout direction. */
export function stackSlideAnimation(): 'slide_from_left' | 'slide_from_right' {
  return isAppRtl() ? 'slide_from_right' : 'slide_from_left';
}

export function stackSlideBackAnimation(): 'slide_from_left' | 'slide_from_right' {
  return isAppRtl() ? 'slide_from_left' : 'slide_from_right';
}
