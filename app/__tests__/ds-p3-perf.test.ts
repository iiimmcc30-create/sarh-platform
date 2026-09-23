import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('P3 performance — frozen visuals', () => {
  it('does not restyle ListingCard, PostItem, or FloatingTabBar', () => {
    const card = src('components/feature/ListingCard.tsx');
    const post = src('components/feature/PostItem.tsx');
    const tabs = src('components/navigation/FloatingTabBar.tsx');
    expect(card).toContain('export const ListingCard');
    expect(post).toContain("from '@/components/ui/AppText'");
    expect(tabs).toContain("label: 'مجتمع سرح'");
    expect(tabs).not.toContain('SarhButton');
  });
});

describe('P3 performance — startup and navigation', () => {
  it('restores cached auth before waiting on token refresh', () => {
    const auth = src('contexts/AuthContext.tsx');
    expect(auth).toContain('setIsLoading(false)');
    expect(auth).toContain('Cached session is enough for first paint');
    expect(auth).not.toMatch(/setActiveMode\(parseActiveMode\(mode\)\);\s*await refreshSessionRef/);
  });

  it('freezes inactive native screens except live routes', () => {
    const layout = src('app/_layout.tsx');
    expect(layout).toContain('enableFreeze(true)');
    expect(layout).toContain('freezeOnBlur: true');
    expect(layout).toContain("name=\"live/watch/[id]\"");
    expect(layout).toContain('freezeOnBlur: false');
    expect(src('app/(tabs)/_layout.tsx')).toContain('freezeOnBlur: true');
  });

  it('skips redundant RTL setup when locale is unchanged', () => {
    const rtl = src('lib/rtl.ts');
    expect(rtl).toContain('if (activeLocale === locale && activeRtl === rtl)');
  });
});

describe('P3 performance — lists images state', () => {
  it('tunes AppFlatList more tightly on Android', () => {
    const list = src('components/ui/AppFlatList.tsx');
    expect(list).toContain("Platform.OS === 'android' ? 7 : 11");
    expect(list).toContain("Platform.OS === 'android' ? 6 : 8");
  });

  it('keeps expo-image cache and downscaling on AppImage', () => {
    const image = src('components/ui/AppImage.tsx');
    expect(image).toContain('cachePolicy="memory-disk"');
    expect(image).toContain('allowDownscaling');
    expect(image).toContain('recyclingKey');
  });

  it('prefetches feed media after cache/network without blocking UI', () => {
    const ctx = src('contexts/AppContext.tsx');
    expect(ctx).toContain('prefetchRemoteImages');
    expect(ctx).toContain('AppUserContext');
    expect(src('lib/prefetchRemoteImages.ts')).toContain('InteractionManager.runAfterInteractions');
    expect(src('lib/prefetchRemoteImages.ts')).toContain('Image.prefetch');
  });

  it('lets Home subscribe only to the user slice', () => {
    const home = src('app/(tabs)/index.tsx');
    expect(home).toContain('useAppUser');
    expect(home).not.toContain('useApp()');
  });

  it('does not add Reanimated or FlashList as production dependencies', () => {
    const pkg = src('package.json');
    expect(pkg).not.toContain('react-native-reanimated');
    expect(pkg).not.toContain('@shopify/flash-list');
  });
});

describe('Wave 1 performance foundations', () => {
  it('keeps chat draft state inside ChatComposer', () => {
    const chat = src('app/chat.tsx');
    expect(chat).toContain('function ChatComposer');
    expect(chat).toContain('const ChatMessageBubble = memo');
    expect(chat).toContain('onContentSizeChange');
    expect(chat).not.toContain('onLayout={() => listRef.current?.scrollToEnd');
  });

  it('refetches message threads without wiping cached rows', () => {
    const hook = src('hooks/useMessageThreads.ts');
    expect(hook).toContain('MESSAGES_REFRESH_TTL_MS');
    expect(hook).toContain('if (showSpinner) setLoading(true)');
    expect(src('components/feature/MessagesPanel.tsx')).toContain('AppFlatList');
    expect(src('components/feature/MessagesPanel.tsx')).not.toContain('ScrollView');
  });

  it('keeps news content visible while a later focus refetches', () => {
    const news = src('app/news.tsx');
    expect(news).toContain('NEWS_REFRESH_TTL_MS');
    expect(news).toContain('if (!hasData.current) setLoading(true)');
    expect(news).toContain('showInitialSpinner');
  });

  it('refreshes profile identity on focus without refetchData', () => {
    const profile = src('app/(tabs)/profile.tsx');
    expect(profile).toContain('void refetchUser()');
    expect(profile).toContain('refetchData(true)');
    expect(src('contexts/AppContext.tsx')).toContain('refetchUser');
  });

  it('delivers listing list thumbs through a Cloudinary width transform', () => {
    const media = src('lib/listingMedia.ts');
    expect(media).toContain('cloudinaryListThumbUrl');
    expect(media).toContain('w_240,c_fill,q_auto,f_auto');
    expect(media).toContain('return cloudinaryListThumbUrl(listingThumbSource(listing))');
  });
});

describe('Wave 5B loading and skeleton consistency', () => {
  it('keeps market listings visible during a failed first-page refetch', () => {
    const market = src('components/market/MarketListingsFeed.tsx');
    expect(market).not.toContain('setItems([])');
    expect(market).toContain('if (!hasItemsRef.current) setLoading(true)');
    expect(market).toContain('loading || (loadFailed && items.length === 0) ? (');
    expect(market).toContain('loadingMore ? <ActivityIndicator');
  });

  it('keeps browse pagination items and only footers extra pages', () => {
    const browse = src('app/market/browse.tsx');
    expect(browse).toContain('if (!hasItemsRef.current) setLoading(true)');
    expect(browse).toContain('(loading || loadFailed) && items.length === 0');
    expect(browse).toContain('loadingMore ? <ActivityIndicator');
    expect(browse).not.toContain('getItemLayout');
  });

  it('does not hide previous search hits behind a full-screen spinner', () => {
    const search = src('app/search.tsx');
    expect(search).toContain('loading && totalResults === 0');
    expect(search).toContain('error && totalResults === 0');
    expect(search).toContain('!loading && !error && canSearch && totalResults === 0');
  });

  it('refetches support lists without replacing them with a spinner', () => {
    expect(src('app/support/faq.tsx')).toContain('loading && faqs.length === 0');
    expect(src('app/support/faq.tsx')).not.toContain('setLoading(true)');
    expect(src('app/support/tickets/index.tsx')).toContain('loading && items.length === 0');
    expect(src('app/support/tickets/index.tsx')).toContain('if (data) setItems(data.items)');
    expect(src('app/support/tickets/[id].tsx')).toContain('if (data) setTicket(data)');
    expect(src('app/support/tickets/[id].tsx')).toContain('loading && !ticket');
  });

  it('refetches connections without wiping the current tab', () => {
    const connections = src('app/profile/connections.tsx');
    expect(connections).toContain('isBackground');
    expect(connections).toContain('loading && users.length === 0');
  });

  it('keeps comments visible while a later reload is in flight', () => {
    expect(src('components/feature/PostCommentsSection.tsx')).toContain(
      'loading && comments.length === 0',
    );
    expect(src('hooks/useListingComments.ts')).toContain(
      'result.error && result.comments.length === 0 && prev.length > 0',
    );
    expect(src('components/feature/ListingCommentsSection.tsx')).toContain(
      'loading && comments.length === 0',
    );
  });

  it('does not introduce a new data library or skeleton kit', () => {
    const pkg = src('package.json');
    expect(pkg).not.toContain('@tanstack/react-query');
    expect(pkg).not.toContain('"swr"');
    expect(src('design-system/index.ts')).not.toContain('Skeleton');
  });
});

describe('Wave 5A lists and virtualization', () => {
  it('does not pin market browse rows to an unverified fixed height', () => {
    expect(src('app/market/browse.tsx')).not.toContain('getItemLayout');
    expect(src('app/market/browse.tsx')).not.toContain('LISTING_ROW_HEIGHT');
  });
});

describe('Wave 5C image and asset performance', () => {
  it('exposes Cloudinary fit presets without a new image library', () => {
    const media = src('lib/listingMedia.ts');
    expect(media).toContain("row: ['w_200'");
    expect(media).toContain("card: ['w_480'");
    expect(media).toContain("wide: ['w_800'");
    expect(media).toContain('function cloudinaryFitUrl');
    expect(src('package.json')).not.toContain('blurhash');
  });

  it('keeps listing detail and frozen media on original URLs', () => {
    expect(src('components/feature/ListingCard.tsx')).toContain('listingThumbUri');
    expect(src('components/feature/PostItem.tsx')).not.toContain('cloudinaryFitUrl');
    expect(src('components/feature/StoryViewer.tsx')).not.toContain('cloudinaryFitUrl');
    expect(src('components/feature/EditorialStoryViewer.tsx')).not.toContain('cloudinaryFitUrl');
    expect(src('components/feature/PostMediaGallery.tsx')).not.toContain('cloudinaryFitUrl');
    expect(src('app/listing/[id].tsx')).not.toContain('cloudinaryFitUrl');
  });

  it('downscales list/card Cloudinary images at the call site', () => {
    expect(src('app/news.tsx')).toContain("cloudinaryFitUrl(story.imageUrl, 'wide')");
    expect(src('components/feature/EditorialStoriesBar.tsx')).toContain(
      "cloudinaryFitUrl(story.imageUrl, 'card')",
    );
    expect(src('components/feature/StoriesBar.tsx')).toContain("cloudinaryFitUrl(");
    expect(src('app/promote.tsx')).toContain('listingThumbUri(listing)');
  });
});

describe('Wave 5D final performance pass', () => {
  it('keeps listing media on original URLs after malahem removal', () => {
    expect(src('app/listing/[id].tsx')).not.toContain('cloudinaryFitUrl');
  });
});
