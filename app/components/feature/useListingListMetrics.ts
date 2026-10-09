import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { listingListMetrics, type ListingListMetrics } from '@/components/feature/listingCardLayout';

/** Screen-width-responsive metrics for the market row card (ListingCard variant="list"). */
export function useListingListMetrics(): ListingListMetrics {
  const { width } = useWindowDimensions();
  return useMemo(() => listingListMetrics(width), [width]);
}
