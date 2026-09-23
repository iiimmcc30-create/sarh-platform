// Powered by OnSpace.AI
// SAFAT — Messages (bottom tab)

import { MessagesPanel } from '@/components/feature/MessagesPanel';
import { AppChromeLayer } from '@/components/navigation/AppChromeLayer';
import { HomeAppBar, shellIdentityStackH } from '@/components/ui/HomeAppBar';
import { space } from '@/design-system';
import { AppText, SarhInput } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { useAuth } from '@/contexts/AuthContext';
import { useAppUser } from '@/hooks/useApp';
import { safePush } from '@/lib/safeNavigate';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function messagesChromeH(insetTop: number) {
  return shellIdentityStackH(insetTop) + space[8] + space[48];
}

export default function MessagesScreen() {
  const router = useRouter();
  const { me } = useAppUser();
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const [headerH, setHeaderH] = useState(() => messagesChromeH(insets.top));
  const [search, setSearch] = useState('');
  const displayName = isAuthenticated
    ? me.arabicName || me.displayName || me.username || 'حسابي'
    : 'ضيف';

  const openSidebar = useCallback(() => {
    if (!isAuthenticated) {
      safePush('/auth/phone', undefined, router);
      return;
    }
    safePush('/sidebar', undefined, router);
  }, [isAuthenticated, router]);

  return (
    <Screen edges={[]}>
      <AppChromeLayer onHeight={setHeaderH}>
        <HomeAppBar
          displayName={displayName}
          avatarUri={me.avatar}
          onAvatarPress={openSidebar}
          center={
            <AppText
              variant="heading3"
              color="textPrimary"
              align="center"
              numberOfLines={1}
              accessibilityRole="header"
            >
              الدردشة
            </AppText>
          }
        >
          <View style={styles.searchSlot}>
            <SarhInput
              value={search}
              onChangeText={setSearch}
              placeholder="بحث..."
              returnKeyType="search"
              trailingIcon="search"
              shape="pill"
              clearButtonMode="while-editing"
              accessibilityRole="search"
              accessibilityLabel="بحث"
            />
          </View>
        </HomeAppBar>
      </AppChromeLayer>
      <ScreenBody
        scroll={false}
        gutter={false}
        bottomInset="tabBar"
        style={{ paddingTop: headerH }}
      >
        <MessagesPanel
          variant="standalone"
          showHeader={false}
          showSearch={false}
          search={search}
          onSearchChange={setSearch}
        />
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchSlot: {
    paddingTop: space[8],
  },
});
