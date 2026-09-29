/** @deprecated Use `ds` from `@/constants/designSystem` */
import { ds } from './designSystem';
import { sarh } from './sarhTokens';

export const pp = {
  pageBg: ds.light.page,
  cardBg: ds.light.card,
  primary: ds.light.primary,
  primaryDark: sarh.color.lightActionPressed,
  textPrimary: ds.light.textPrimary,
  textSecondary: ds.light.textSecondary,
  textMuted: ds.light.textMuted,
  border: ds.light.stroke,
  borderSoft: 'rgba(28, 131, 84, 0.12)',
  chipInactiveBg: ds.light.chip,
  /** ~10% brand tint on white (derived from the Light primary #1C8354). */
  verifiedBg: '#E8F3EE',
  verifiedText: ds.light.primary,
  space: ds.space,
  radius: {
    sm: ds.radius.sm,
    md: ds.radius.md,
    lg: ds.radius.lg,
    xl: ds.radius.xl,
    pill: ds.radius.pill,
    fab: ds.radius.fab,
  },
  headerIcon: ds.iconBtn.md,
  headerIconLg: ds.iconBtn.md,
  categoryTile: ds.categoryTile,
  listingThumb: ds.listingThumb,
  tabFab: ds.tabBar.fabSize,
  shadowCard: {},
  shadowHeaderBtn: {},
};
