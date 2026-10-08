// Powered by OnSpace.AI
// SAFAT — Messages (bottom tab)

import { MessagesPanel } from '@/components/feature/MessagesPanel';
import { AppChromeLayer } from '@/components/navigation/AppChromeLayer';
import { useChromeContentShift } from '@/hooks/useAppChrome';
import {
  HomeAppBar,
  SHELL_ICON_SIZE,
  SHELL_TOOL,
  shellIdentityStackH,
} from '@/components/ui/HomeAppBar';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { space } from '@/design-system';
import { AppText, SarhInput } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { useAuth } from '@/contexts/AuthContext';
import { useAppUser } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { safePush } from '@/lib/safeNavigate';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Compact (40pt) header search — same field, slightly smaller than the 48pt default. */
const SEARCH_H = space[40];

function messagesChromeH(insetTop: number) {
  return shellIdentityStackH(insetTop) + space[8] + SEARCH_H;
}

export default function MessagesScreen() {
  const router = useRouter();
  const { me } = useAppUser();
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const [headerH, setHeaderH] = useState(() => messagesChromeH(insets.top));
  const contentShift = useChromeContentShift(headerH);
  const [search, setSearch] = useState('');
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const { colors } = useTheme();
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

  /** Header «رسالة جديدة» — opens the existing NewMessageSheet (guests sign in first). */
  const openNewMessage = useCallback(() => {
    if (!isAuthenticated) {
      safePush('/auth/phone', undefined, router);
      return;
    }
    setNewMessageOpen(true);
  }, [isAuthenticated, router]);

  return (
    <Screen edges={[]}>
      <AppChromeLayer onHeight={setHeaderH}>
        <HomeAppBar
          displayName={displayName}
          avatarUri={me.avatar}
          onAvatarPress={openSidebar}
          trailing={
            <Pressable
              onPress={openNewMessage}
              style={styles.newMessageBtn}
              hitSlop={space[4]}
              accessibilityRole="button"
              accessibilityLabel="رسالة جديدة"
              testID="messages-new-message"
            >
              <AppIcon name="square-pen" size={SHELL_ICON_SIZE + 2} color={colors.textPrimary} />
            </Pressable>
          }
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
              size="compact"
              clearButtonMode="while-editing"
              accessibilityRole="search"
              accessibilityLabel="بحث"
            />
          </View>
        </HomeAppBar>
      </AppChromeLayer>
      <Animated.View style={[{ flex: 1 }, contentShift]}>
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
          newMessageOpen={newMessageOpen}
          onNewMessageOpenChange={setNewMessageOpen}
        />
      </ScreenBody>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchSlot: {
    paddingTop: space[8],
  },
  newMessageBtn: {
    width: SHELL_TOOL,
    height: SHELL_TOOL,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
