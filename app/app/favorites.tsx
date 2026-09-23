import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { PostItem } from '@/components/feature/PostItem';
import { AppFlatList } from '@/components/ui/AppFlatList';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, SarhButton } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useApp } from '@/hooks/useApp';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { usePostFeedActions } from '@/lib/usePostFeedActions';
import { safePush } from '@/lib/safeNavigate';
import type { Post } from '@/services/types';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ListRenderItemInfo,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { type ThemeColors } from '@/constants/theme';

export default function FavoritesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const { isAuthenticated } = useAuth();
  const {
    posts,
    bookmarkedPosts,
    fetchPosts,
  } = useApp();
  const { enrich, bind } = usePostFeedActions();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (opts?: { refresh?: boolean }) => {
      if (opts?.refresh) setRefreshing(true);
      else setLoading(true);
      try {
        await fetchPosts('for_you', { force: opts?.refresh });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchPosts],
  );

  useFocusEffect(
    useCallback(() => {
      if (posts.length === 0) {
        void load();
      }
    }, [load, posts.length]),
  );

  const favorites = useMemo(
    () => posts.filter((post) => bookmarkedPosts.has(post.id)),
    [posts, bookmarkedPosts],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Post>) => {
      const post = { ...enrich(item), bookmarked: true };
      return <PostItem post={post} {...bind(item)} />;
    },
    [enrich, bind],
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="المفضلة" showBack />
      <ScreenBody scroll={false} gutter={false}>
        {loading && favorites.length === 0 ? (
          <ActivityIndicator size="large" color={colors.electricBright} style={styles.loader} />
        ) : (
          <AppFlatList
            data={favorites}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={favorites.length === 0 ? styles.emptyList : styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void load({ refresh: true })}
                tintColor={colors.electricBright}
              />
            }
            ListEmptyComponent={
              <Stack gap="sm" align="center" fill style={styles.empty}>
                <AppText variant="display">🔖</AppText>
                <AppText variant="heading3">لا توجد عناصر مفضلة</AppText>
                <AppText variant="body" color="textMuted" align="center">
                  احفظ المنشورات من مجلس سرح لتظهر هنا
                </AppText>
                <SarhButton
                  title="تصفح مجلس سرح"
                  onPress={() => safePush('/(tabs)/posts', undefined, router)}
                />
              </Stack>
            }
          />
        )}
      </ScreenBody>
    </Screen>
  );
}

function createStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    loader: {
      marginTop: 60,
    },
    list: {
      paddingBottom: 32,
    },
    emptyList: {
      flexGrow: 1,
      paddingBottom: 32,
    },
    empty: {
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingTop: 80,
    },
  });
}
