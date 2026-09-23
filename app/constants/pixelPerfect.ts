/** @deprecated Use `ds` from `@/constants/designSystem` */
import { ds } from './designSystem';

export const pp = {
  pageBg: ds.light.page,
  cardBg: ds.light.card,
  primary: ds.light.primary,
  primaryDark: '#18965B',
  textPrimary: ds.light.textPrimary,
  textSecondary: ds.light.textSecondary,
  textMuted: ds.light.textMuted,
  border: ds.light.stroke,
  borderSoft: 'rgba(32, 182, 111, 0.12)',
  chipInactiveBg: ds.light.chip,
  verifiedBg: '#E8F7EF',
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
