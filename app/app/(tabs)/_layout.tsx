// Powered by OnSpace.AI
// SAFAT — Tabs Layout

import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FloatingTabBar } from '@/components/navigation/FloatingTabBar';
import { ds } from '@/constants/designSystem';
import { AppChromeProvider } from '@/hooks/useAppChrome';
import { useTheme } from '@/hooks/useTheme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const sceneBg = colors.screenRoot;
  const tabBarHeight = ds.tabBar.height + Math.max(insets.bottom, ds.tabBar.marginBottom);

  return (
    <AppChromeProvider>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          freezeOnBlur: true,
          tabBarShowLabel: false,
          sceneStyle: { backgroundColor: sceneBg },
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
            height: tabBarHeight,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'الرئيسية' }} />
        <Tabs.Screen name="search" options={{ title: 'البحث' }} />
        <Tabs.Screen name="market" options={{ title: 'السوق', href: null }} />
        <Tabs.Screen
          name="add"
          options={{
            title: '',
            href: null,
          }}
        />
        <Tabs.Screen name="posts" options={{ title: 'مجتمع سرح' }} />
        <Tabs.Screen name="live" options={{ href: null }} />
        <Tabs.Screen name="messages" options={{ title: 'المحادثات' }} />
        <Tabs.Screen name="more" options={{ title: 'المزيد', href: null }} />
        <Tabs.Screen name="profile" options={{ title: 'الملف الشخصي', href: null }} />
      </Tabs>
    </AppChromeProvider>
  );
}
