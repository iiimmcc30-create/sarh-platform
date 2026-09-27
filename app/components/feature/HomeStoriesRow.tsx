// SAFAT - Home stories row: the existing StoriesBar (ring, labels, skeleton and
// its built-in StoryViewer) fed by the existing stories feed service.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { StoriesBar } from '@/components/feature/StoriesBar';
import { useAuth } from '@/contexts/AuthContext';
import { useAppUser } from '@/hooks/useApp';
import { HOME_TAB_RESELECT_EVENT } from '@/lib/homeQuickAccess';
import { safePush } from '@/lib/safeNavigate';
import { fetchStoriesFeed, type StoryGroup } from '@/services/stories';

/** Compact ring for Home (StoriesBar default is 64). */
export const HOME_STORY_RING_SIZE = 56;

type HomeStoriesState = {
  feed: StoryGroup[];
  myStories: StoryGroup | null;
};

const EMPTY_STATE: HomeStoriesState = { feed: [], myStories: null };

/**
 * Last rendered result per session token, so a list-header remount (e.g. the
 * market filter bar changing) re-renders instantly instead of hiding the row
 * until the (cached) fetch resolves.
 */
let lastShown: { key: string; state: HomeStoriesState } | null = null;

export function hasAnyStories(state: HomeStoriesState): boolean {
  return state.feed.length > 0 || (state.myStories?.stories.length ?? 0) > 0;
}

export function HomeStoriesRow() {
  const router = useRouter();
  const { accessToken, isAuthenticated } = useAuth();
  const { me } = useAppUser();
  const sessionKey = accessToken ?? 'guest';
  const [state, setState] = useState<HomeStoriesState>(() =>
    lastShown?.key === sessionKey ? lastShown.state : EMPTY_STATE,
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // fetchStoriesFeed keeps its own 60s cache; failures keep the row hidden.
  const load = useCallback(
    async (force = false) => {
      try {
        const data = await fetchStoriesFeed(accessToken, { force });
        const next = { feed: data.items ?? [], myStories: data.myStories ?? null };
        lastShown = { key: accessToken ?? 'guest', state: next };
        if (!mountedRef.current) return;
        setState(next);
      } catch {
        /* silent: Home never blocks on stories */
      }
    },
    [accessToken],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(HOME_TAB_RESELECT_EVENT, () => {
      void load(true);
    });
    return () => sub.remove();
  }, [load]);

  const onAddStory = useCallback(() => {
    safePush(isAuthenticated ? '/create/story' : '/auth/phone', undefined, router);
  }, [isAuthenticated, router]);

  const onRefresh = useCallback(() => {
    void load(true);
  }, [load]);

  // Same empty handling as elsewhere: nothing to show -> no section.
  if (!hasAnyStories(state)) return null;

  return (
    <StoriesBar
      feed={state.feed}
      myStories={state.myStories}
      myAvatar={me.avatar ?? undefined}
      currentUserId={me.id}
      accessToken={accessToken}
      onAddStory={onAddStory}
      onRefresh={onRefresh}
      size={HOME_STORY_RING_SIZE}
    />
  );
}
