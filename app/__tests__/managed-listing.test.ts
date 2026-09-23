import { isManagedListing, listingAdvertiserName, managedSeller } from '@/lib/managedListing';
import { readFileSync } from 'fs';
import path from 'path';

describe('managed listing identity', () => {
  it('does not invent a user id for managed advertisers', () => {
    const seller = managedSeller({
      displayUsername: 'user43478',
      displaySellerName: 'محمد العتيبي',
      seller: null,
    });
    expect(seller.id).toBe('');
    expect(seller.username).toBe('user43478');
    expect(seller.arabicName).toBe('محمد العتيبي');
    expect(isManagedListing({ origin: 'ADMIN_MANAGED', seller })).toBe(true);
    expect(listingAdvertiserName({
      origin: 'ADMIN_MANAGED',
      displaySellerName: 'محمد العتيبي',
      seller,
    })).toBe('محمد العتيبي');
  });

  it('keeps real sellers addressable', () => {
    expect(isManagedListing({
      origin: 'USER',
      seller: { id: 'user-1' },
    })).toBe(false);
    expect(listingAdvertiserName({
      origin: 'USER',
      seller: { id: 'user-1', arabicName: 'سارة', displayName: '', username: 'sara' },
    })).toBe('سارة');
  });

  it('does not open a profile or message thread for managed listings', () => {
    const detail = readFileSync(path.join(__dirname, '../app/listing/[id].tsx'), 'utf8');
    const card = readFileSync(path.join(__dirname, '../components/feature/ListingCard.tsx'), 'utf8');
    expect(detail).toContain('isManagedListing(listing)');
    expect(detail).toContain('allowMessage={!listing || !isManagedListing(listing)}');
    expect(detail).not.toContain('router.push(`/users/${');
    expect(card).toContain('const sellerId = managed ? undefined : seller?.id');
    expect(card).toContain('listingAdvertiserName(listing)');
  });
});
