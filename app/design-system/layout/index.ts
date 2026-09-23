/**
 * Sarh UI Architecture V2 — L2 layout primitives.
 *
 * Layer order: tokens → primitives → **layout** → patterns → screens.
 * A screen composes with these and never computes spacing, width, or
 * direction on its own.
 *
 * Kept out of the `@/design-system` barrel on purpose: that entry is
 * token-only and is imported by `@/constants/theme`.
 */
export { Screen } from './Screen';
export type { ScreenBackground, ScreenProps } from './Screen';

export { FullBleed, ScreenBody, useScreenBodyContentInset } from './ScreenBody';
export type { FullBleedProps, ScreenBodyInset, ScreenBodyProps } from './ScreenBody';

export { Section } from './Section';
export type { SectionProps } from './Section';

export { Stack } from './Stack';
export type { StackProps } from './Stack';

export { Row } from './Row';
export type { RowProps } from './Row';

export { BottomAction } from './BottomAction';
export type { BottomActionProps, BottomActionSummary } from './BottomAction';

export {
  ALIGN,
  BOTTOM_ACTION_MIN_HEIGHT,
  GAP,
  JUSTIFY,
  SECTION_GAP,
} from './metrics';
export type { AlignToken, GapToken, JustifyToken } from './metrics';
