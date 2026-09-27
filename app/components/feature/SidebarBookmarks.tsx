import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { AppText } from '@/components/ui/AppText';
import { SarhChip } from '@/design-system/components';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { getListingFavoriteIds } from '@/lib/listingFavorite';
import { formatListingPrice } from '@/lib/messageListingContext';
import { postDetailHref } from '@/lib/openPost';
import { getRtlDirection, getRtlRow } from '@/lib/rtl';
import { closeThenPush, safePush } from '@/lib/safeNavigate';
import {
  SIDEBAR_BOOKMARK_SECTIONS,
  resolveBookmarked,
  savedPostIdsNewestFirst,
  sidebarBookmarkEmptyText,
  sidebarBookmarkItems,
  type SidebarBookmarkItem,
  type SidebarBookmarkSection,
} from '@/lib/sidebarBookmarks';
import { fetchListingById } from '@/services/listings';
import { fetchPostById } from '@/services/posts';
import type { Listing, Post } from '@/services/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  InteractionManager,
  Pressable,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';

const ITEM_WIDTH = 104;
const ITEM_GAP = spacing.sm;
const THUMB_HEIGHT = 68;
/** Fixed row height so switching sections / empty / loading never jumps. */
const ROW_HEIGHT = THUMB_HEIGHT + 44;

/**
 * Compact "العلامات المرجعية" content: a two-option toggle and one horizontal row.
 * - المفضلة: listings from the existing listing-favorites store (lib/listingFavorite).
 * - المحفوظات: posts from the existing post bookmarks (AppContext bookmarkedPosts).
 * Items resolve from the in-memory cache first; only missing ids of the visible
 * section are fetched (existing GET endpoints), after the sidebar slide settles.
 * `presentation="screen"` (the /bookmarks screen) opens items with a plain push;
 * the sidebar closes itself first.
 */
export function SidebarBookmarks({
  presentation = 'sidebar',
}: {
  presentation?: 'sidebar' | 'screen';
} = {}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const { listings, posts, bookmarkedPosts } = useApp();
  const [section, setSection] = useState<SidebarBookmarkSection>('favorites');
  const [favoriteIds, setFavoriteIds] = useState<string[] | null>(null);
  const [fetchedListings, setFetchedListings] = useState<Record<string, Listing | null>>({});
  const [fetchedPosts, setFetchedPosts] = useState<Record<string, Post | null>>({});
  const [pending, setPending] = useState<Record<SidebarBookmarkSection, number>>({
    favorites: 0,
    saved: 0,
  });
  const requested = useRef(new Set<string>());
  const mounted = useRef(true);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    void getListingFavoriteIds().then((ids) => {
      if (mounted.current) setFavoriteIds(ids);
    });
  }, []);

  const savedIds = useMemo(() => savedPostIdsNewestFirst(bookmarkedPosts), [bookmarkedPosts]);
  const favorites = useMemo(
    () => resolveBookmarked(favoriteIds ?? [], listings, fetchedListings),
    [favoriteIds, listings, fetchedListings],
  );
  const saved = useMemo(
    () => resolveBookmarked(savedIds, posts, fetchedPosts),
    [savedIds, posts, fetchedPosts],
  );
  const activeMissing = section === 'favorites' ? favorites.missing : saved.missing;

  useEffect(() => {
    if (section === 'favorites' && favoriteIds === null) return;
    const ids = activeMissing.filter((id) => !requested.current.has(`${section}:${id}`));
    if (ids.length === 0) return;
    ids.forEach((id) => requested.current.add(`${section}:${id}`));
    const target = section;
    setPending((prev) => ({ ...prev, [target]: prev[target] + 1 }));
    const done = () => {
      if (mounted.current) setPending((prev) => ({ ...prev, [target]: Math.max(0, prev[target] - 1) }));
    };
    InteractionManager.runAfterInteractions(() => {
      if (target === 'favorites') {
        void Promise.all(ids.map((id) => fetchListingById(id)))
          .then((rows) => {
            if (!mounted.current) return;
            setFetchedListings((prev) => {
              const next = { ...prev };
              ids.forEach((id, i) => {
                next[id] = rows[i] ?? null;
              });
              return next;
            });
          })
          .finally(done);
      } else {
        void Promise.all(ids.map((id) => fetchPostById(id)))
          .then((rows) => {
            if (!mounted.current) return;
            setFetchedPosts((prev) => {
              const next = { ...prev };
              ids.forEach((id, i) => {
                next[id] = rows[i] ?? null;
              });
              return next;
            });
          })
          .finally(done);
      }
    });
  }, [section, activeMissing, favoriteIds]);

  const items = useMemo(
    () =>
      section === 'favorites'
        ? sidebarBookmarkItems('favorites', { listings: favorites.items })
        : sidebarBookmarkItems('saved', { posts: saved.items }),
    [section, favorites.items, saved.items],
  );

  const loading =
    items.length === 0 &&
    ((section === 'favorites' && favoriteIds === null) || pending[section] > 0);

  const selectSection = useCallback(
    (next: SidebarBookmarkSection) => {
      if (next === section) return;
      fade.setValue(0.35);
      setSection(next);
      Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    },
    [fade, section],
  );

  const open = useCallback((item: SidebarBookmarkItem) => {
    if (presentation === 'screen') {
      safePush(
        item.kind === 'listing'
          ? { pathname: '/listing/[id]', params: { id: item.id } }
          : postDetailHref(item.id),
      );
      return;
    }
    if (item.kind === 'listing') {
      closeThenPush({ pathname: '/listing/[id]', params: { id: item.id } });
    } else {
      closeThenPush(postDetailHref(item.id));
    }
  }, [presentation]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<SidebarBookmarkItem>) => {
      const title = item.title || (item.kind === 'listing' ? 'عرض' : 'منشور');
      const meta =
        item.kind === 'listing' ? formatListingPrice(item.price, item.currency) : item.authorName;
      return (
        <Pressable
          onPress={() => open(item)}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={title}
        >
          <View style={styles.thumb}>
            {item.image ? (
              <Image source={uriSource(item.image)} style={styles.thumbImage} contentFit="cover" />
            ) : (
              <AppIcon
                name={item.kind === 'listing' ? 'pricetag-outline' : 'document-text-outline'}
                size={20}
                color={colors.textMuted}
              />
            )}
          </View>
          <AppText style={styles.itemTitle} numberOfLines={1}>
            {title}
          </AppText>
          {meta ? (
            <AppText style={styles.itemMeta} numberOfLines={1}>
              {meta}
            </AppText>
          ) : null}
        </Pressable>
      );
    },
    [colors.textMuted, open, styles],
  );

  return (
    <View style={styles.root}>
      <View style={[styles.toggle, getRtlRow()]} accessibilityRole="tablist">
        {SIDEBAR_BOOKMARK_SECTIONS.map((s) => (
          <SarhChip
            key={s.key}
            appearance="filter"
            compact
            label={s.label}
            selected={section === s.key}
            onPress={() => selectSection(s.key)}
          />
        ))}
      </View>

      <Animated.View style={[styles.listWrap, { opacity: fade }]}>
        {items.length === 0 ? (
          <View style={styles.stateBox}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.electricBright} />
            ) : (
              <AppText style={styles.emptyText}>{sidebarBookmarkEmptyText(section)}</AppText>
            )}
          </View>
        ) : (
          <FlatList
            key={section}
            horizontal
            data={items}
            keyExtractor={(item) => `${item.kind}:${item.id}`}
            renderItem={renderItem}
            showsHorizontalScrollIndicator={false}
            snapToInterval={ITEM_WIDTH + ITEM_GAP}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            nestedScrollEnabled
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={3}
            style={getRtlDirection()}
            contentContainerStyle={styles.listContent}
          />
        )}
      </Animated.View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      gap: spacing.sm,
      paddingBottom: spacing.sm,
    },
    toggle: {
      alignItems: 'center',
      gap: spacing.sm,
    },
    listWrap: {
      height: ROW_HEIGHT,
    },
    listContent: {
      gap: ITEM_GAP,
    },
    item: {
      width: ITEM_WIDTH,
      gap: 2,
    },
    thumb: {
      width: ITEM_WIDTH,
      height: THUMB_HEIGHT,
      borderRadius: radius.md,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    thumbImage: {
      width: '100%',
      height: '100%',
    },
    itemTitle: {
      ...typography.caption,
      color: colors.textPrimary,
    },
    itemMeta: {
      ...typography.caption,
      color: colors.textMuted,
    },
    stateBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      ...typography.caption,
      color: colors.textMuted,
      textAlign: 'center',
    },
    pressed: {
      opacity: 0.72,
    },
  });
}

export default SidebarBookmarks;