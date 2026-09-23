import type { User } from '@/services/types';

type SellerLike = {
  id?: string;
  username?: string;
  displayName?: string;
  arabicName?: string;
  avatar?: string;
  verified?: boolean;
  country?: string;
} | null;

export function isManagedListing(listing: {
  origin?: string | null;
  seller?: { id?: string | null } | null;
}) {
  return listing.origin === 'ADMIN_MANAGED' || !listing.seller?.id;
}

export function managedSeller(raw: {
  displayUsername?: string | null;
  displaySellerName?: string | null;
  seller?: SellerLike;
}): User {
  const name = raw.displaySellerName?.trim() || raw.seller?.arabicName || '';
  const username = raw.displayUsername?.trim() || raw.seller?.username || '';
  return {
    id: '',
    username,
    displayName: name || username,
    arabicName: name || username,
    avatar: undefined,
    verified: false,
    followers: 0,
    following: 0,
    rating: null,
    reviewCount: 0,
    country: 'SA',
    bio: '',
  };
}

export function listingAdvertiserName(listing: {
  origin?: string | null;
  displaySellerName?: string | null;
  seller?: {
    id?: string | null;
    arabicName?: string;
    displayName?: string;
    username?: string;
  } | null;
}) {
  if (isManagedListing(listing)) {
    return (
      listing.displaySellerName ||
      listing.seller?.arabicName ||
      listing.seller?.displayName ||
      listing.seller?.username ||
      'معلن'
    );
  }
  const seller = listing.seller;
  return seller?.arabicName || seller?.displayName || seller?.username || 'بائع';
}
