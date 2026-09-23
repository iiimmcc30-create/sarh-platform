import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSellerListingsPager,
  EMPTY_SELLER_LISTINGS_PAGER_STATE,
  type SellerListingsPager,
  type SellerListingsPagerState,
} from '@/services/sellerListingsPager';

export function useSellerListingsPager(opts: {
  sellerId?: string | null;
  accessToken?: string | null;
}) {
  const pagerRef = useRef<SellerListingsPager | null>(null);
  if (pagerRef.current == null) {
    pagerRef.current = createSellerListingsPager();
  }

  const [state, setState] = useState<SellerListingsPagerState>(
    () => pagerRef.current?.getState() ?? EMPTY_SELLER_LISTINGS_PAGER_STATE,
  );

  useEffect(() => {
    let pager = pagerRef.current;
    if (pager == null) {
      pager = createSellerListingsPager();
      pagerRef.current = pager;
    }
    const unsub = pager.subscribe(setState);
    return () => {
      unsub();
      pager.dispose();
      if (pagerRef.current === pager) pagerRef.current = null;
    };
  }, []);

  const loadFirstPage = useCallback(async () => {
    const pager = pagerRef.current;
    if (!pager) return;
    await pager.loadFirstPage({
      sellerId: opts.sellerId,
      accessToken: opts.accessToken,
    });
  }, [opts.accessToken, opts.sellerId]);

  const loadNextPage = useCallback(async () => {
    const pager = pagerRef.current;
    if (!pager) return;
    await pager.loadNextPage({
      sellerId: opts.sellerId,
      accessToken: opts.accessToken,
    });
  }, [opts.accessToken, opts.sellerId]);

  return {
    ...state,
    loadFirstPage,
    loadNextPage,
  };
}
