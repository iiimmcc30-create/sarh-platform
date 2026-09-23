// Powered by OnSpace.AI
// SAFAT — Home Tab (الصفاة)

import { useRouter } from 'expo-router';
import { HomeQuickAccess } from '@/components/feature/HomeQuickAccess';
import {
  MarketListingsFeed,
  type MarketListingsFeedHandle,
} from '@/components/market/MarketListingsFeed';
import { AppChromeLayer } from '@/components/navigation/AppChromeLayer';
import { HomeAppBar, shellIdentityStackH } from '@/components/ui/HomeAppBar';
import { Screen, ScreenBody } from '@/design-system/layout';
import { useAppUser } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { useAppChromeScroll } from '@/hooks/useAppChrome';
import { HOME_TAB_RESELECT_EVENT } from '@/lib/homeQuickAccess';
import { safePush } from '@/lib/safeNavigate';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
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

  const quickAccess = useMemo(() => <HomeQuickAccess />, []);

  return (
    <Screen edges={[]}>
      <AppChromeLayer onHeight={setHeaderH}>
        <HomeAppBar
          displayName={displayName}
          avatarUri={me.avatar}
          onAvatarPress={openSidebar}
        />
      </AppChromeLayer>

      <ScreenBody scroll={false} gutter={false} bottomInset="tabBar" padBottom="md">
        <MarketListingsFeed
          ref={listingsRef}
          variant="home"
          extraHeader={quickAccess}
          padTop={headerH}
        />
      </ScreenBody>
    </Screen>
  );
}
