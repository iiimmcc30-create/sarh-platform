/**
 * Pure motion rules for the shared iOS-style bottom sheet (`components/ui/SheetModal.tsx`).
 * Kept free of React Native imports so it can be unit-tested.
 */

/** Height (px) from the sheet's top edge where a downward drag grabs the sheet. */
export const SHEET_DRAG_ZONE = 64;
/** Downward travel (px) that dismisses on release (capped at 35% of the sheet). */
export const SHEET_DISMISS_DISTANCE = 96;
/** Downward fling velocity (px/ms) that dismisses on release. */
export const SHEET_DISMISS_VELOCITY = 0.9;
/** Close / backdrop fade duration (ms). */
export const SHEET_CLOSE_MS = 260;
export const SHEET_BACKDROP_IN_MS = 220;
/** Off-screen start before the sheet has been measured. */
export const SHEET_OFFSCREEN = 2000;

/** True when a vertical drag should start moving the sheet. */
export function shouldStartSheetDrag(input: {
  dx: number;
  dy: number;
  /** Touch start (window y). */
  startY: number;
  /** Sheet top edge (window y). */
  sheetTop: number;
  dismissible: boolean;
}): boolean {
  const { dx, dy, startY, sheetTop, dismissible } = input;
  if (!dismissible) return false;
  if (dy <= 6 || Math.abs(dy) <= Math.abs(dx) * 1.2) return false;
  const fromTop = startY - sheetTop;
  return fromTop >= -8 && fromTop <= SHEET_DRAG_ZONE;
}

/** Release decision: far enough, or a quick downward flick. */
export function shouldDismissSheet(dy: number, vy: number, sheetHeight: number): boolean {
  const distance = Math.min(SHEET_DISMISS_DISTANCE, Math.max(40, sheetHeight * 0.35));
  return dy > distance || (vy > SHEET_DISMISS_VELOCITY && dy > 12);
}
