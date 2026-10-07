import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ListingCard } from '@/components/feature/ListingCard';
import { PostItem } from '@/components/feature/PostItem';
import { AppFlatList } from '@/components/ui/AppFlatList';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import {
  ListingCardSkeleton,
  PostCardSkeleton,
  SkeletonBox,
  SkeletonCircle,
  SkeletonRegion,
} from '@/components/ui/skeleton';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, SarhAvatar, SarhButton } from '@/design-system/components';
import { Row, Screen, Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { confirmDestructive, presentActionSheet } from '@/lib/actionSheet';
import { openUserProfile } from '@/lib/openUserProfile';
import { requireAuth } from '@/lib/postInteractions';
import { inlineEnd, inlineStart } from '@/lib/rtl';
import { safePush } from '@/lib/safeNavigate';
import { showToast } from '@/lib/toast';
import { usePostFeedActions } from '@/lib/usePostFeedActions';
import {
  COLLECTION_EMPTY_FEED_TEXT,
  collectionFollowersLabel,
  collectionMembersLabel,
  collectionOwnerName,
  deleteCollection,
  fetchCollection,
  fetchCollectionFeed,
  mergeById,
  setBlockCollection,
  setFollowCollection,
  type Collection,
  type CollectionType,
} from '@/services/collections';
import { resolveMediaUrl } from '@/services/media';
import { promptReport } from '@/services/reports';
import type { Listing, Post } from '@/services/types';
import { AppRefreshControl } from '@/components/ui/AppRefreshControl';

const COVER_HEIGHT = 168;

export default function CollectionDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const { isAuthenticated } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { enrich, bind, observe } = usePostFeedActions();
  const observeRef = useRef(observe);
  observeRef.current = observe;

  const [collection, setCollection] = useState<Collection | null>(null);
  const [type, setType] = useState<CollectionType | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (soft = false) => {
      if (!id) return;
      if (!soft) setLoading(true);
      setError(null);
      try {
        const [detail, feed] = await Promise.all([
          fetchCollection(id),
          fetchCollectionFeed(id),
        ]);
        if (!mounted.current) return;
        setCollection(detail);
        setType(feed.type);
        if (feed.type === 'ADS') {
          setListings(feed.listings);
          setPosts([]);
        } else {
          setPosts(feed.posts);
          setListings([]);
        }
        setCursor(feed.nextCursor);
        setHasMore(feed.hasMore);
      } catch (err) {
        if (!mounted.current) return;
        setError(err instanceof Error ? err.message : 'تعذّر فتح القائمة');
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!id || !hasMore || !cursor || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const feed = await fetchCollectionFeed(id, cursor);
      if (!mounted.current) return;
      if (feed.type === 'ADS') {
        setListings((prev) => mergeById(prev, feed.listings));
      } else {
        setPosts((prev) => mergeById(prev, feed.posts));
      }
      setCursor(feed.nextCursor);
      setHasMore(feed.hasMore);
    } catch {
      /* keep */
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }, [cursor, hasMore, id, loading, loadingMore]);

  const toggleFollow = useCallback(async () => {
    if (!collection) return;
    if (!requireAuth(isAuthenticated, 'متابعة القائمة')) return;
    setFollowBusy(true);
    try {
      const res = await setFollowCollection(collection.id, !collection.isFollowing);
      setCollection((prev) =>
        prev
          ? {
              ...prev,
              isFollowing: res.following,
              followersCount: res.followersCount,
            }
          : prev,
      );
    } catch (err) {
      void showToast(err instanceof Error ? err.message : 'تعذّر تحديث المتابعة', 'error');
    } finally {
      if (mounted.current) setFollowBusy(false);
    }
  }, [collection, isAuthenticated]);

  const openMenu = useCallback(async () => {
    if (!collection) return;
    if (collection.isOwner) {
      const key = await presentActionSheet({
        title: collection.name,
        items: [
          { key: 'edit', label: 'تعديل القائمة', icon: 'create-outline' },
          { key: 'members', label: 'إدارة الأعضاء', icon: 'people-outline' },
          { key: 'delete', label: 'حذف القائمة', icon: 'trash-outline', destructive: true },
          { key: 'cancel', label: 'إلغاء', cancel: true },
        ],
      });
      if (key === 'edit') {
        safePush(
          {
            pathname: '/collections/[id]/edit',
            params: {
              id: collection.id,
              name: collection.name,
              description: collection.description ?? '',
              coverUrl: collection.coverUrl ?? '',
              type: collection.type,
            },
          },
          undefined,
          router,
        );
      } else if (key === 'members') {
        safePush(
          { pathname: '/collections/[id]/members', params: { id: collection.id } },
          undefined,
          router,
        );
      } else if (key === 'delete') {
        const ok = await confirmDestructive(
          'حذف القائمة',
          'هل أنت متأكد من حذف هذه القائمة؟ لا يمكن التراجع.',
          'حذف',
        );
        if (!ok) return;
        try {
          await deleteCollection(collection.id);
          void showToast('تم حذف القائمة', 'success');
          router.back();
        } catch (err) {
          void showToast(err instanceof Error ? err.message : 'تعذّر الحذف', 'error');
        }
      }
      return;
    }

    // Non-owner menu: only block + report, exactly as specified.
    const key = await presentActionSheet({
      title: collection.name,
      items: [
        { key: 'block', label: 'حظر القائمة', icon: 'block', destructive: true },
        { key: 'report', label: 'إبلاغ عن القائمة', icon: 'flag-outline', destructive: true },
        { key: 'cancel', label: 'إلغاء', cancel: true },
      ],
    });
    if (key === 'block') {
      if (!requireAuth(isAuthenticated, 'حظر القائمة')) return;
      try {
        await setBlockCollection(collection.id, true);
        void showToast('تم حظر القائمة', 'success');
        router.back();
      } catch (err) {
        void showToast(err instanceof Error ? err.message : 'تعذّر الحظر', 'error');
      }
    } else if (key === 'report') {
      await promptReport('collection', collection.id, isAuthenticated);
    }
  }, [collection, isAuthenticated, router]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 800,
  }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item?: Post }> }) => {
      for (const token of viewableItems) {
        if (token.item?.id) observeRef.current(token.item.id);
      }
    },
  ).current;

  const coverUri = resolveMediaUrl(collection?.coverUrl);
  const header = (
    <View>
      <View style={[styles.cover, { height: COVER_HEIGHT + insets.top }]}>
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, styles.coverFallback]} />
        )}
        <View style={[styles.coverScrim, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.coverBtn, inlineEnd(spacing.md)]}
            accessibilityRole="button"
            accessibilityLabel="رجوع"
          >
            <AppIcon name="chevron-forward" size={22} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => void openMenu()}
            style={[styles.coverBtn, inlineStart(spacing.md)]}
            accessibilityRole="button"
            accessibilityLabel="المزيد"
          >
            <AppIcon name="ellipsis-horizontal" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>

      <Stack gap="sm" style={styles.info}>
        {collection ? (
          <>
            <AppText variant="heading2" color="textPrimary">
              {collection.name}
            </AppText>
            <Pressable
              onPress={() => openUserProfile(router, collection.owner.id)}
              accessibilityRole="button"
              accessibilityLabel={collectionOwnerName(collection.owner)}
            >
              <Row gap="xs" align="center">
                <SarhAvatar
                  uri={collection.owner.avatar}
                  name={collectionOwnerName(collection.owner)}
                  size="xs"
                />
                <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                  {collectionOwnerName(collection.owner)}{' '}
                  <AppText variant="caption" color="textMuted">
                    @{collection.owner.username}
                  </AppText>
                </AppText>
              </Row>
            </Pressable>
            <AppText variant="caption" color="textMuted">
              {collectionMembersLabel(collection.membersCount)}
              {'  '}
              {collectionFollowersLabel(collection.followersCount)}
            </AppText>
            {!collection.isOwner ? (
              <View style={styles.followWrap}>
                <SarhButton
                  title={collection.isFollowing ? 'متابَع' : 'متابعة'}
                  variant={collection.isFollowing ? 'secondary' : 'primary'}
                  size="sm"
                  shape="pill"
                  loading={followBusy}
                  onPress={() => void toggleFollow()}
                />
              </View>
            ) : (
              <Row gap="sm">
                <SarhButton
                  title="تعديل"
                  variant="secondary"
                  size="sm"
                  shape="pill"
                  leftIcon="create-outline"
                  onPress={() =>
                    safePush(
                      {
                        pathname: '/collections/[id]/edit',
                        params: {
                          id: collection.id,
                          name: collection.name,
                          description: collection.description ?? '',
                          coverUrl: collection.coverUrl ?? '',
                          type: collection.type,
                        },
                      },
                      undefined,
                      router,
                    )
                  }
                />
                <SarhButton
                  title="الأعضاء"
                  variant="secondary"
                  size="sm"
                  shape="pill"
                  leftIcon="people-outline"
                  onPress={() =>
                    safePush(
                      {
                        pathname: '/collections/[id]/members',
                        params: { id: collection.id },
                      },
                      undefined,
                      router,
                    )
                  }
                />
              </Row>
            )}
          </>
        ) : loading ? (
          <SkeletonRegion style={styles.infoSkel}>
            <SkeletonBox width="55%" height={22} radius={6} />
            <Row gap="xs" align="center">
              <SkeletonCircle size={24} />
              <SkeletonBox width="40%" height={12} radius={4} />
            </Row>
            <SkeletonBox width="35%" height={12} radius={4} />
            <SkeletonBox width={88} height={32} radius={999} />
          </SkeletonRegion>
        ) : null}
      </Stack>
    </View>
  );

  const emptyFeed =
    !loading &&
    ((type === 'ADS' && listings.length === 0) ||
      (type !== 'ADS' && posts.length === 0));

  const listEmpty = loading ? (
    <SkeletonRegion>
      {type === 'ADS'
        ? [0, 1, 2].map((i) => <ListingCardSkeleton key={i} />)
        : [false, true, false].map((withMedia, i) => (
            <PostCardSkeleton key={i} withMedia={withMedia} />
          ))}
    </SkeletonRegion>
  ) : emptyFeed ? (
    <AppText variant="body" color="textMuted" align="center" style={styles.emptyFeed}>
      {COLLECTION_EMPTY_FEED_TEXT}
    </AppText>
  ) : null;

  if (error && !collection) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Stack gap="md" align="center" style={styles.errorBox}>
          <AppText variant="body" color="textMuted" align="center">
            {error}
          </AppText>
          <SarhButton title="رجوع" variant="secondary" shape="pill" onPress={() => router.back()} />
        </Stack>
      </Screen>
    );
  }

  if (type === 'ADS') {
    return (
      <Screen edges={['bottom']} pattern={false}>
        <AppFlatList
          data={listings}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          renderItem={({ item }: ListRenderItemInfo<Listing>) => (
            <ListingCard
              listing={item}
              variant="list"
              listMode="market"
              onPress={() =>
                safePush({ pathname: '/listing/[id]', params: { id: item.id } }, undefined, router)
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
          ListEmptyComponent={listEmpty}
          contentContainerStyle={styles.listContent}
          onEndReachedThreshold={0.4}
          onEndReached={() => void loadMore()}
          refreshControl={
            <AppRefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
            />
          }
          ListFooterComponent={
            <View style={styles.footer}>
              {loadingMore ? <ActivityIndicator color={colors.electric} /> : null}
            </View>
          }
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']} pattern={false}>
      <AppFlatList
        data={posts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        renderItem={({ item }: ListRenderItemInfo<Post>) => {
          const post = enrich(item);
          return <PostItem post={post} {...bind(post)} />;
        }}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={styles.listContent}
        onEndReachedThreshold={0.4}
        onEndReached={() => void loadMore()}
        refreshControl={
          <AppRefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
          />
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {loadingMore ? <ActivityIndicator color={colors.electricBright} /> : null}
          </View>
        }
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={7}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
      />
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    cover: {
      width: '100%',
      backgroundColor: colors.bgField,
      overflow: 'hidden',
    },
    coverFallback: { backgroundColor: colors.borderSoft },
    coverScrim: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    coverBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.28)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.32)',
    },
    info: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      backgroundColor: colors.screenRoot,
    },
    infoSkel: { gap: spacing.sm },
    followWrap: { alignSelf: 'flex-start' },
    listContent: { flexGrow: 1, backgroundColor: colors.screenRoot },
    listSeparator: { height: spacing.sm },
    emptyFeed: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xxxl,
    },
    footer: {
      alignItems: 'center',
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
      minHeight: 40,
    },
    errorBox: {
      flex: 1,
      justifyContent: 'center',
      padding: spacing.xl,
    },
  });
}
