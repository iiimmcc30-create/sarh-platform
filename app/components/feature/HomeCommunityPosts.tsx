import { PostItem } from '@/components/feature/PostItem';
import { AppText } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { space } from '@/design-system';
import { useApp } from '@/hooks/useApp';
import { useLayout } from '@/hooks/useLayout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { openPostDetail } from '@/lib/openPost';
import { pickHomeCommunityPosts } from '@/lib/homeCommunityPosts';
import { usePostFeedActions } from '@/lib/usePostFeedActions';
import { safePush } from '@/lib/safeNavigate';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

export function HomeCommunityPosts() {
  const router = useRouter();
  const { gutter } = useLayout();
  const styles = useThemedStyles(() => createStyles());
  const {
    posts,
    fetchPosts,
  } = useApp();
  const { enrich, bind } = usePostFeedActions();
  const postsLenRef = useRef(posts.length);
  const inflightRef = useRef(false);
  const needsFailureRecoveryRef = useRef(false);
  postsLenRef.current = posts.length;
  if (posts.length > 0) needsFailureRecoveryRef.current = false;

  useFocusEffect(
    useCallback(() => {
      if (inflightRef.current) return;
      const shouldForce = postsLenRef.current === 0 && needsFailureRecoveryRef.current;
      inflightRef.current = true;
      void fetchPosts('for_you', shouldForce ? { force: true } : undefined).then((ok) => {
        if (postsLenRef.current === 0) {
          needsFailureRecoveryRef.current = !ok;
        }
      }).finally(() => {
        inflightRef.current = false;
      });
    }, [fetchPosts]),
  );

  const featured = useMemo(() => pickHomeCommunityPosts(posts), [posts]);

  if (featured.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Row align="center" justify="between" style={[styles.sectionHead, { paddingHorizontal: gutter }]}>
        <AppText variant="heading2" color="textPrimary" style={styles.sectionTitle} numberOfLines={1}>
          مجتمع سرح
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="عرض كل المنشورات"
          onPress={() => safePush('/(tabs)/posts', undefined, router)}
          hitSlop={8}
          style={styles.seeAllBtn}
        >
          <AppText variant="caption" color="primary" numberOfLines={1}>
            عرض الكل
          </AppText>
        </Pressable>
      </Row>
      {featured.map((item) => (
        <PostItem
          key={item.id}
          post={enrich(item)}
          {...bind(item)}
        />
      ))}
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    wrap: {
      paddingBottom: space[8],
    },
    sectionHead: {
      paddingTop: space[8],
      paddingBottom: space[8],
    },
    sectionTitle: {
      flex: 1,
      minWidth: 0,
    },
    seeAllBtn: {
      flexShrink: 0,
      paddingStart: space[8],
    },
  });
}

export default HomeCommunityPosts;
