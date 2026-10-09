// Powered by OnSpace.AI
// SAFAT — Home Tab (الصفاة)

import { useRouter } from 'expo-router';
import { HomeStoriesRow } from '@/components/feature/HomeStoriesRow';
import {
  MarketListingsFeed,
  type MarketListingsFeedHandle,
} from '@/components/market/MarketListingsFeed';
import { AppChromeLayer } from '@/components/navigation/AppChromeLayer';
import { HomeAppBar, shellIdentityStackH } from '@/components/ui/HomeAppBar';
import { Screen, ScreenBody } from '@/design-system/layout';
import { useAppUser } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { useAppChromeScroll, useChromeContentShift } from '@/hooks/useAppChrome';
import { HOME_TAB_RESELECT_EVENT } from '@/lib/homeQuickAccess';
import { safePush } from '@/lib/safeNavigate';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, DeviceEventEmitter } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const router = useRouter();
  const { me } = useAppUser();
  const { isAuthenticated } = useAuth();
  const { setChromeVisible } = useAppChromeScroll();
  const insets = useSafeAreaInsets();
  const displayName = isAuthenticated
    ? me.arabicName || me.displayName || me.username || 'حسابي'
    : 'ضيف';

  const listingsRef = useRef<MarketListingsFeedHandle>(null);
  const refreshBusyRef = useRef(false);
  const [headerH, setHeaderH] = useState(() => shellIdentityStackH(insets.top));
  const contentShift = useChromeContentShift(headerH);

  const refreshHome = useCallback(() => {
    if (refreshBusyRef.current) return;
    refreshBusyRef.current = true;
    setChromeVisible(true);
    void (listingsRef.current?.refresh() ?? Promise.resolve()).finally(() => {
      refreshBusyRef.current = false;
    });
  }, [setChromeVisible]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(HOME_TAB_RESELECT_EVENT, refreshHome);
    return () => sub.remove();
  }, [refreshHome]);

  const openSidebar = useCallback(() => {
    if (!isAuthenticated) {
      safePush('/auth/phone', undefined, router);
      return;
    }
    safePush('/sidebar', undefined, router);
  }, [isAuthenticated, router]);

  // Home list header: user stories row directly under the app bar (the market
  // feed adds its filter/categories bar and listings after this). No quick-access rail.
  const homeHeader = useMemo(() => <HomeStoriesRow />, []);

  return (
    <Screen edges={[]}>
      <AppChromeLayer onHeight={setHeaderH}>
        <HomeAppBar
          displayName={displayName}
          avatarUri={me.avatar}
          onAvatarPress={openSidebar}
        />
      </AppChromeLayer>

      <Animated.View style={[{ flex: 1 }, contentShift]}>
      <ScreenBody scroll={false} gutter={false} bottomInset="tabBar" padBottom="md">
        <MarketListingsFeed
          ref={listingsRef}
          variant="home"
          extraHeader={homeHeader}
          padTop={headerH}
        />
      </ScreenBody>
      </Animated.View>
    </Screen>
  );
}
