import type { ListingOrigin } from '@prisma/client';

export type ManagedDisplayInput = {
  displayUsername: string;
  displaySellerName: string;
  displayPhone: string;
  displayRegion: string;
};

/** Fields written together so contact/search columns stay equal to display identity. */
export function managedContactFields(input: ManagedDisplayInput) {
  const displayUsername = input.displayUsername.trim();
  const displaySellerName = input.displaySellerName.trim();
  const displayPhone = input.displayPhone.trim();
  const displayRegion = input.displayRegion.trim();
  return {
    origin: 'ADMIN_MANAGED' as ListingOrigin,
    sellerId: null,
    displayUsername,
    displaySellerName,
    displayPhone,
    displayRegion,
    contactPhone: displayPhone,
    location: displayRegion,
    arabicLocation: displayRegion,
  };
}

export function isManagedOrigin(origin: string | null | undefined) {
  return origin === 'ADMIN_MANAGED';
}
