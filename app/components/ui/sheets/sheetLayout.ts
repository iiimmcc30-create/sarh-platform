/**
 * Pure layout rules for the shared sheet system (no React Native imports, unit-tested).
 */

/** Top corner radius of every bottom sheet surface. */
export const SHEET_RADIUS = 22;
/** Grabber pill. */
export const SHEET_GRABBER = { width: 36, height: 5 } as const;
/** Option / action row height (iOS list row). */
export const SHEET_ROW_HEIGHT = 54;
/** Rounded group (actions / cancel) corner radius. */
export const SHEET_GROUP_RADIUS = 14;
/** Side inset of the rounded groups inside the surface. */
export const SHEET_GUTTER = 12;

/**
 * Bottom padding INSIDE the sheet surface: the surface itself always reaches the
 * screen edge (under the home indicator / Android nav bar); content clears it.
 */
export function sheetBottomPadding(insetBottom: number, base = 12): number {
  const inset = Number.isFinite(insetBottom) && insetBottom > 0 ? insetBottom : 0;
  return inset > 0 ? inset + 4 : base;
}

export type SheetItemLike = {
  key: string;
  cancel?: boolean;
};

/** Split action-sheet items into the main group and the separate cancel group. */
export function splitSheetItems<T extends SheetItemLike>(items: T[]): { actions: T[]; cancel: T | null } {
  const cancel = items.find((i) => i.cancel) ?? null;
  return { actions: items.filter((i) => !i.cancel), cancel };
}

/** What the trailing (left in RTL) accessory of a row shows. */
export function sheetRowAccessory(params: {
  pickerMode: boolean;
  selected: boolean;
  destructive?: boolean;
}): 'check' | 'none' {
  if (params.pickerMode) return params.selected ? 'check' : 'none';
  return 'none';
}
