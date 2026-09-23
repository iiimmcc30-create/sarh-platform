/**
 * Official Sarh promote catalog — client display / fallback copy.
 *
 * Billing always happens on the server from the same table
 * (`backend-nest/src/listings/promote-catalog.ts`). Do not charge from this file.
 */
export const PROMOTE_CATALOG_CURRENCY = 'SAR' as const;

export type PromoteCatalogGoal = 'featured' | 'pinned' | 'visibility';
export type PromotePricedGoal = PromoteCatalogGoal | 'both';

export type PromoteCatalogOption = {
  goal: PromoteCatalogGoal;
  durationDays: number;
  durationHours: number;
  amount: number;
  labelAr: string;
};

export type PromotePricedOption = {
  goal: PromotePricedGoal;
  durationDays: number;
  durationHours: number;
  amount: number;
  labelAr: string;
};

export const PROMOTE_CATALOG: readonly PromoteCatalogOption[] = [
  {
    goal: 'featured',
    durationDays: 1,
    durationHours: 24,
    amount: 9,
    labelAr: 'يوم واحد',
  },
  {
    goal: 'featured',
    durationDays: 3,
    durationHours: 72,
    amount: 25,
    labelAr: '٣ أيام',
  },
  {
    goal: 'pinned',
    durationDays: 1,
    durationHours: 24,
    amount: 12,
    labelAr: 'يوم واحد',
  },
  {
    goal: 'pinned',
    durationDays: 3,
    durationHours: 72,
    amount: 29,
    labelAr: '٣ أيام',
  },
  {
    goal: 'visibility',
    durationDays: 1,
    durationHours: 24,
    amount: 19,
    labelAr: 'يوم واحد',
  },
  {
    goal: 'visibility',
    durationDays: 2,
    durationHours: 48,
    amount: 35,
    labelAr: 'يومين',
  },
];

/** Lowest official catalog amount — featured 1 day. */
export const PROMOTE_CATALOG_AMOUNT_MIN = Math.min(
  ...PROMOTE_CATALOG.map((row) => row.amount),
);

export function listPromoteCatalogOptions(
  goal: PromoteCatalogGoal,
): PromoteCatalogOption[] {
  return PROMOTE_CATALOG.filter((row) => row.goal === goal);
}

function matchDuration(
  row: PromoteCatalogOption,
  input: { durationHours?: number; durationDays?: number },
): boolean {
  if (input.durationHours != null && Number.isFinite(input.durationHours)) {
    return row.durationHours === Math.round(input.durationHours);
  }
  if (input.durationDays != null && Number.isFinite(input.durationDays)) {
    return row.durationDays === Math.round(input.durationDays);
  }
  return false;
}

export function lookupPromoteCatalogOption(
  goal: PromoteCatalogGoal,
  input: { durationHours?: number; durationDays?: number },
): PromoteCatalogOption | null {
  return (
    PROMOTE_CATALOG.find((row) => row.goal === goal && matchDuration(row, input)) ??
    null
  );
}

export function lookupPromotePrice(
  goal: PromotePricedGoal,
  input: { durationHours?: number; durationDays?: number },
): PromotePricedOption | null {
  if (goal === 'both') {
    const featured = lookupPromoteCatalogOption('featured', input);
    const pinned = lookupPromoteCatalogOption('pinned', input);
    if (!featured || !pinned) return null;
    if (
      featured.durationHours !== pinned.durationHours ||
      featured.durationDays !== pinned.durationDays
    ) {
      return null;
    }
    return {
      goal: 'both',
      durationDays: featured.durationDays,
      durationHours: featured.durationHours,
      amount: featured.amount + pinned.amount,
      labelAr: featured.labelAr,
    };
  }
  const row = lookupPromoteCatalogOption(goal, input);
  return row ? { ...row } : null;
}

export function boostPlansFromCatalog() {
  const toPlan = (row: PromoteCatalogOption) => ({
    durationDays: row.durationDays,
    durationHours: row.durationHours,
    amount: row.amount,
    labelAr: row.labelAr,
  });
  const featured = listPromoteCatalogOptions('featured').map(toPlan);
  const pinned = listPromoteCatalogOptions('pinned').map(toPlan);
  const both = featured
    .map((featureRow) => {
      const pinRow = pinned.find(
        (row) => row.durationHours === featureRow.durationHours,
      );
      if (!pinRow) return null;
      return {
        durationDays: featureRow.durationDays,
        durationHours: featureRow.durationHours,
        amount: featureRow.amount + pinRow.amount,
        labelAr: featureRow.labelAr,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  return { featured, pinned, both };
}

export function promotionPlansFromCatalog() {
  return listPromoteCatalogOptions('visibility').map((row) => ({
    durationDays: row.durationDays,
    durationHours: row.durationHours,
    amount: row.amount,
    labelAr: row.labelAr,
  }));
}
