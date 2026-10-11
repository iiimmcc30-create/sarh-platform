import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CollectionCreateFab } from '@/components/feature/collections/CollectionCreateFab';
import { CollectionRow } from '@/components/feature/collections/CollectionRow';
import { AppFlatList } from '@/components/ui/AppFlatList';
import { AppRefreshControl } from '@/components/ui/AppRefreshControl';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, SarhBackButton, SarhDivider } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { applyCollectionFollow } from '@/lib/collectionLists';
import { requireAuth } from '@/lib/postInteractions';
import { getRtlRow } from '@/lib/rtl';
import { safePush } from '@/lib/safeNavigate';
import { showToast } from '@/lib/toast';
import {
  COLLECTIONS_EMPTY_TEXT,
  fetchSuggestedCollections,
  mergeById,
  setFollowCollection,
  type Collection,
} from '@/services/collections';

/** «القوائم المقترحة» — the rest of discovery, same row, paged. */
export default function SuggestedCollectionsScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const [rows, setRows] = useState<Collection[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true);
    setError(null);
    try {
      const page = await fetchSuggestedCollections();
      if (!mounted.current) return;
      setRows(page.collections);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : 'تعذّر تحميل القوائم');
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore || !cursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchSuggestedCollections(cursor);
      if (!mounted.current) return;
      setRows((prev) => mergeById(prev, page.collections));
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch {
      /* keep the page */
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }, [cursor, hasMore, loading, loadingMore]);

  const toggleFollow = useCallback(
    async (collection: Collection) => {
      if (!requireAuth(isAuthenticated, 'إضافة القوائم')) return;
      if (collection.isFollowing || followBusy) return;
      const optimistic = applyCollectionFollow(collection, true);
      setRows((prev) => prev.map((c) => (c.id === collection.id ? optimistic : c)));
      setFollowBusy(collection.id);
      try {
        const res = await setFollowCollection(collection.id, true);
        if (!mounted.current) return;
        setRows((prev) =>
          prev.map((c) =>
            c.id === collection.id
              ? { ...c, isFollowing: res.following, followersCount: res.followersCount }
              : c,
          ),
        );
      } catch (err) {
        if (!mounted.current) return;
        setRows((prev) => prev.map((c) => (c.id === collection.id ? collection : c)));
        void showToast(err instanceof Error ? err.message : 'تعذّر تحديث المتابعة', 'error');
      } finally {
        if (mounted.current) setFollowBusy(null);
      }
    },
    [followBusy, isAuthenticated],
  );

  const openCreate = useCallback(() => {
    if (!requireAuth(isAuthenticated, 'إنشاء قائمة')) return;
    safePush('/collections/create', undefined, router);
  }, [isAuthenticated, router]);

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={[styles.header, getRtlRow()]}>
        <SarhBackButton onPress={() => router.back()} />
        <AppText variant="heading3" color="textPrimary" style={styles.title}>
          القوائم المقترحة
        </AppText>
      </View>
      <ScreenBody scroll={false} gutter={false}>
        {loading && rows.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : error && rows.length === 0 ? (
          <View style={styles.center}>
            <AppText variant="body" color="textMuted" align="center">
              {error}
            </AppText>
            <Pressable onPress={() => void load()} accessibilityRole="button">
              <AppText variant="label" color="primary">
                إعادة المحاولة
              </AppText>
            </Pressable>
          </View>
        ) : (
          <AppFlatList
            data={rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            onEndReachedThreshold={0.4}
            onEndReached={() => void loadMore()}
            refreshControl={
              <AppRefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load({ soft: true });
                }}
              />
            }
            ListHeaderComponent={
              <AppText variant="label" color="textPrimary" style={styles.sectionTitle}>
                اكتشاف قوائم جديدة
              </AppText>
            }
            ListEmptyComponent={
              <AppText variant="body" color="textMuted" align="center" style={styles.empty}>
                {COLLECTIONS_EMPTY_TEXT}
              </AppText>
            }
            renderItem={({ item, index }) => (
              <View>
                <CollectionRow
                  collection={item}
                  mode="discover"
                  busy={followBusy === item.id}
                  onFollow={() => void toggleFollow(item)}
                  onPress={() =>
                    safePush({ pathname: '/collections/[id]', params: { id: item.id } }, undefined, router)
                  }
                />
                {index < rows.length - 1 ? <SarhDivider /> : null}
              </View>
            )}
            ListFooterComponent={
              <View style={styles.footer}>
                {loadingMore ? <ActivityIndicator color={colors.textMuted} /> : null}
              </View>
            }
          />
        )}
      </ScreenBody>
      <CollectionCreateFab onPress={openCreate} bottomOffset={spacing.lg} />
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      backgroundColor: colors.screenRoot,
    },
    title: { flex: 1 },
    sectionTitle: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
    },
    listContent: { flexGrow: 1, paddingBottom: 120 },
    empty: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xl,
    },
    footer: { alignItems: 'center', paddingVertical: spacing.lg, minHeight: 48 },
  });
}
