import { appFont } from '@/constants/fonts';

/**
 * Official Sarh face: Tajawal.
 * Each weight maps to a distinct loaded family — Regular/Medium use their own faces;
 * SemiBold aliases to Bold (Tajawal has no 600 face).
 *
 * `@/design-system` AppText uses these families as-is.
 * Legacy `@/components/ui/AppText` resolves via weight-aware `resolveAppFontFace`.
 */
export const fontFamily = {
  regular: appFont.regular,
  medium: appFont.medium,
  semiBold: appFont.semibold,
  bold: appFont.bold,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
} as const;

export type TypeRole =
  | 'display'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'body'
  | 'bodySmall'
  | 'label'
  | 'caption'
  | 'micro'
  | 'price';

export type TypeToken = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: (typeof fontWeight)[keyof typeof fontWeight];
};

export const typography: Record<TypeRole, TypeToken> = {
  display: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: fontWeight.bold,
  },
  heading1: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: fontWeight.bold,
  },
  heading2: {
    fontFamily: fontFamily.semiBold,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: fontWeight.semiBold,
  },
  heading3: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: fontWeight.semiBold,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: fontWeight.regular,
  },
  bodySmall: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: fontWeight.regular,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: fontWeight.medium,
  },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: fontWeight.regular,
  },
  micro: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: fontWeight.regular,
  },
  /** Marketplace / paid-service amounts. Listing prices keep their own styling. */
  price: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: fontWeight.bold,
  },
};

/**
 * Architecture V2 role names → physical roles above.
 *
 * `Label` resolves to `bodySmall` (14/400). The physical `label` token (15/500)
 * is what the blueprint calls `BodyMedium`; it already ships on SarhButton and
 * SarhSettingsRow, so it keeps its size and weight.
 */
export const SEMANTIC_TYPE_ROLE = {
  Display: 'display',
  ScreenTitle: 'heading1',
  SectionTitle: 'heading2',
  CardTitle: 'heading3',
  Body: 'body',
  BodyMedium: 'label',
  Label: 'bodySmall',
  Caption: 'caption',
  Meta: 'micro',
  Button: 'label',
  Price: 'price',
} as const satisfies Record<string, TypeRole>;

export type SemanticTypeRole = keyof typeof SEMANTIC_TYPE_ROLE;

/** camelCase aliases accepted directly by `<AppText variant="…">`. */
export const TYPE_ROLE_ALIAS = {
  screenTitle: 'heading1',
  sectionTitle: 'heading2',
  cardTitle: 'heading3',
  bodyMedium: 'label',
  meta: 'micro',
  button: 'label',
} as const satisfies Record<string, TypeRole>;

export type TypeRoleAlias = keyof typeof TYPE_ROLE_ALIAS;

export type TypeVariant = TypeRole | TypeRoleAlias | SemanticTypeRole;

export function resolveTypeRole(variant: TypeVariant): TypeRole {
  if (variant in TYPE_ROLE_ALIAS) return TYPE_ROLE_ALIAS[variant as TypeRoleAlias];
  if (variant in SEMANTIC_TYPE_ROLE) return SEMANTIC_TYPE_ROLE[variant as SemanticTypeRole];
  return variant as TypeRole;
}
