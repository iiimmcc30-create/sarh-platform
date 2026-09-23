import {
  mergeListingPages,
  searchListingsPage,
  shouldFetchNextListingPage,
  type ListingSearchPage,
} from '@/services/listings';
import { createRequestGeneration } from '@/services/requestCoordination';
import type { Listing } from '@/services/types';

export const SELLER_LIST_NEAR_END_PX = 400;

export type SellerListingsPagerState = {
  listings: Listing[];
  nextCursor: string | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  loadFailed: boolean;
  loadMoreFailed: boolean;
};

export const EMPTY_SELLER_LISTINGS_PAGER_STATE: SellerListingsPagerState = {
  listings: [],
  nextCursor: null,
  hasMore: false,
  loading: false,
  loadingMore: false,
  loadFailed: false,
  loadMoreFailed: false,
};

export function isSellerListNearEnd(
  event: {
    layoutMeasurement: { height: number };
    contentOffset: { y: number };
    contentSize: { height: number };
  },
  thresholdPx: number = SELLER_LIST_NEAR_END_PX,
): boolean {
  return (
    event.layoutMeasurement.height + event.contentOffset.y >=
    event.contentSize.height - thresholdPx
  );
}

type SearchPage = (
  params: { sellerId: string; cursor?: string },
  accessToken?: string | null,
) => Promise<ListingSearchPage>;

export type SellerListingsPager = {
  getState(): SellerListingsPagerState;
  subscribe(listener: (state: SellerListingsPagerState) => void): () => void;
  loadFirstPage(opts: {
    sellerId?: string | null;
    accessToken?: string | null;
  }): Promise<void>;
  loadNextPage(opts: {
    sellerId?: string | null;
    accessToken?: string | null;
  }): Promise<void>;
  dispose(): void;
};

export function createSellerListingsPager(deps?: { searchPage?: SearchPage }): SellerListingsPager {
  const searchPage: SearchPage =
    deps?.searchPage ?? ((params, accessToken) => searchListingsPage(params, accessToken));
  const gen = createRequestGeneration();
  let cancelled = false;
  let inflightCursor: string | null = null;
  let firstPageInflight = false;
  let loadedSellerId: string | null = null;
  let state: SellerListingsPagerState = { ...EMPTY_SELLER_LISTINGS_PAGER_STATE };
  const listeners = new Set<(next: SellerListingsPagerState) => void>();

  function emit(patch: Partial<SellerListingsPagerState>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener(state));
  }

  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    async loadFirstPage({ sellerId, accessToken }) {
      if (cancelled) return;
      if (!sellerId) {
        loadedSellerId = null;
        emit({ ...EMPTY_SELLER_LISTINGS_PAGER_STATE });
        return;
      }

      const token = gen.next();
      firstPageInflight = true;
      inflightCursor = null;
      if (state.listings.length === 0) {
        emit({ loading: true, loadFailed: false, loadMoreFailed: false, loadingMore: false });
      } else {
        emit({ loadFailed: false, loadMoreFailed: false, loadingMore: false });
      }

      try {
        const page = await searchPage({ sellerId }, accessToken);
        if (cancelled || !gen.isCurrent(token)) return;
        loadedSellerId = sellerId;
        emit({
          listings: page.listings,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          loading: false,
          loadingMore: false,
          loadFailed: false,
          loadMoreFailed: false,
        });
      } catch (err) {
        if (cancelled || !gen.isCurrent(token)) return;
        emit({ loading: false, loadFailed: true });
        throw err;
      } finally {
        if (gen.isCurrent(token)) firstPageInflight = false;
      }
    },
    async loadNextPage({ sellerId, accessToken }) {
      if (cancelled) return;
      if (!sellerId) return;
      if (loadedSellerId && loadedSellerId !== sellerId) return;

      const cursor = state.nextCursor;
      if (
        !shouldFetchNextListingPage({
          hasMore: state.hasMore,
          nextCursor: cursor,
          loading: state.loading || firstPageInflight,
          loadingMore: state.loadingMore || inflightCursor != null,
        })
      ) {
        return;
      }
      if (!cursor) return;
      if (inflightCursor === cursor) return;

      inflightCursor = cursor;
      const token = gen.next();
      emit({ loadingMore: true, loadMoreFailed: false });

      try {
        const page = await searchPage({ sellerId, cursor }, accessToken);
        if (cancelled || !gen.isCurrent(token)) return;
        emit({
          listings: mergeListingPages(state.listings, page.listings),
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          loadingMore: false,
          loadMoreFailed: false,
        });
      } catch {
        if (cancelled || !gen.isCurrent(token)) return;
        emit({ loadingMore: false, loadMoreFailed: true });
      } finally {
        if (inflightCursor === cursor) inflightCursor = null;
      }
    },
    dispose() {
      cancelled = true;
      inflightCursor = null;
      firstPageInflight = false;
      gen.next();
    },
  };
}
