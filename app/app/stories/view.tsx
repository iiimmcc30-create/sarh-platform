// SAFAT — Story Viewer Screen (from profile / deep link)
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StoryViewer } from '@/components/feature/StoryViewer';
import { buildStoryGroups } from '@/components/feature/StoriesBar';
import { useAuth } from '@/contexts/AuthContext';
import { useAppUser } from '@/hooks/useApp';
import { fetchStoriesFeed, type StoryGroup } from '@/services/stories';

export default function StoryViewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { groupIndex: groupIndexParam } = useLocalSearchParams<{ groupIndex?: string }>();
  const { accessToken } = useAuth();
  const { me } = useAppUser();

  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFeed = useCallback(async () => {
    try {
      const data = await fetchStoriesFeed(accessToken);
      setGroups(buildStoryGroups(data.myStories, data.items ?? []));
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const startIndex = Math.max(0, parseInt(groupIndexParam ?? '0', 10) || 0);

  if (loading) {
    return (
      <View style={[styles.loader, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (groups.length === 0) {
    router.back();
    return null;
  }

  return (
    <StoryViewer
      groups={groups}
      startGroupIndex={Math.min(startIndex, groups.length - 1)}
      currentUserId={me.id}
      accessToken={accessToken}
      onClose={() => router.back()}
      onRefresh={loadFeed}
      presentation="screen"
    />
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
