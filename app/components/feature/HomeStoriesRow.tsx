// SAFAT - Home stories row: the existing StoriesBar (ring, labels, skeleton and
// its built-in StoryViewer) fed by the existing stories feed service.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { StoriesBar } from '@/components/feature/StoriesBar';
import { useAuth } from '@/contexts/AuthContext';
import { useAppUser } from '@/hooks/useApp';
import { HOME_TAB_RESELECT_EVENT } from '@/lib/homeQuickAccess';
import { HOME_ADD_STORY_LABEL, homeStoriesRowMode } from '@/lib/homeStories';
import { safePush } from '@/lib/safeNavigate';
import { fetchStoriesFeed, type StoryGroup } from '@/services/stories';

/** Compact ring for Home (StoriesBar default is 64). */
export const HOME_STORY_RING_SIZE = 56;

type HomeStoriesState = {
  feed: StoryGroup[];
  myStories: StoryGroup | null;
  loaded: boolean;
};

const EMPTY_STATE: HomeStoriesState = { feed: [], myStories: null, loaded: false };

/**
 * Last rendered result per session token, so a list-header remount (e.g. the
 * market filter bar changing) re-renders instantly instead of hiding the row
 * until the (cached) fetch resolves.
 */
let lastShown: { key: string; state: HomeStoriesState } | null = null;

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

  // fetchStoriesFeed keeps its own 60s cache; failures keep what is shown.
  const load = useCallback(
    async (force = false) => {
      try {
        const data = await fetchStoriesFeed(accessToken, { force });
        const next = {
          feed: data.items ?? [],
          myStories: data.myStories ?? null,
          loaded: true,
        };
        lastShown = { key: accessToken ?? 'guest', state: next };
        if (!mountedRef.current) return;
        setState(next);
      } catch {
        /* silent: Home never blocks on stories */
        if (mountedRef.current) setState((prev) => ({ ...prev, loaded: true }));
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

  // Existing story creation screen (same one the add slot has always targeted).
  const onAddStory = useCallback(() => {
    safePush('/create/story', undefined, router);
  }, [router]);

  const onRefresh = useCallback(() => {
    void load(true);
  }, [load]);

  const mode = homeStoriesRowMode({
    isAuthenticated,
    feedCount: state.feed.length,
  });
  if (mode === 'hidden') return null;

  return (
    <StoriesBar
      feed={state.feed}
      myStories={mode === 'withAdd' ? state.myStories : null}
      myAvatar={me.avatar ?? undefined}
      currentUserId={me.id}
      accessToken={accessToken}
      loading={!state.loaded}
      onAddStory={onAddStory}
      onRefresh={onRefresh}
      size={HOME_STORY_RING_SIZE}
      showAddSlot={mode === 'withAdd'}
      addLabel={HOME_ADD_STORY_LABEL}
    />
  );
}
