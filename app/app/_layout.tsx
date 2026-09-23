// Powered by OnSpace.AI
// SAFAT — Root Layout

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { enableFreeze } from 'react-native-screens';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { AppProvider } from '@/contexts/AppContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { OnboardingProvider, useOnboarding } from '@/contexts/OnboardingContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { NotificationManager } from '@/components/NotificationManager';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { BootSplashGate } from '@/components/ui/BootSplashGate';
import { ListingCovenantHost } from '@/components/listing/ListingCovenantHost';
import { ActionSheetHost } from '@/components/ui/ActionSheetHost';
import { ToastHost } from '@/components/ui/ToastHost';
import { SarhPatternBackground } from '@/components/ui/SarhPatternBackground';
import { NavigationPathTracker } from '@/components/navigation/NavigationPathTracker';
import { fadeScaleScreenLayout } from '@/components/navigation/FadeScaleAppear';
import { fadeScaleStackScreenOptions } from '@/lib/screenTransition';
import { setupRtl, getRtlDirection, setupRtlFromStorage } from '@/lib/rtl';
import { resolveBootNavigation } from '@/lib/bootRouting';

import { bootstrapTheme } from '@/constants/themeBootstrap';

enableFreeze(true);
bootstrapTheme().catch(() => {});
setupRtl();

void SplashScreen.preventAutoHideAsync().catch(() => {});

WebBrowser.maybeCompleteAuthSession();

export const unstable_settings = {
  initialRouteName: 'index',
};

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const { isComplete: onboardingComplete, isLoading: onboardingLoading } = useOnboarding();
  const router = useRouter();
  const segments = useSegments();
  const lastHrefRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || onboardingLoading) return;

    const action = resolveBootNavigation({
      authLoading: isLoading,
      onboardingLoading,
      onboardingComplete,
      isAuthenticated,
      firstSegment: segments[0] as string | undefined,
    });

    if (action.type === 'replace') {
      if (lastHrefRef.current === action.href) return;
      lastHrefRef.current = action.href;
      router.replace(action.href as any);
      return;
    }
    lastHrefRef.current = null;
  }, [isAuthenticated, isLoading, onboardingComplete, onboardingLoading, segments, router]);

  return <>{children}</>;
}

function RootNavigator() {
  const { isDark, colors: themeColors } = useTheme();

  const stack = (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenLayout={fadeScaleScreenLayout}
        screenOptions={fadeScaleStackScreenOptions({
          headerShown: false,
          freezeOnBlur: true,
          contentStyle: {
            // RTL policy: root direction from I18nManager — never force 'ltr' here.
            ...getRtlDirection(),
          },
        })}
      >
        <Stack.Screen
          name="(tabs)"
          options={{
            animation: 'none',
            presentation: 'card',
            contentStyle: { backgroundColor: themeColors.screenRoot, ...getRtlDirection() },
          }}
        />
        <Stack.Screen name="chat" />
        <Stack.Screen name="feed-suppliers/index" />
        <Stack.Screen name="feed-suppliers/[id]" />
        <Stack.Screen name="listing/[id]" />
        <Stack.Screen name="market/categories/[id]" />
        <Stack.Screen name="market/browse" />
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="search" />
        <Stack.Screen name="news" />
        <Stack.Screen name="users/[id]" />
        <Stack.Screen name="ministry/index" />
        <Stack.Screen name="ministry/services/[id]" />
        <Stack.Screen
          name="sidebar"
          options={{
            // JS drawer in app/sidebar.tsx owns slide + dim from one Animated progress.
            // Native stack slide would move the dim independently of the panel.
            animation: 'none',
            presentation: 'transparentModal',
            gestureEnabled: false,
            contentStyle: { backgroundColor: 'transparent', ...getRtlDirection() },
          }}
        />
        <Stack.Screen name="notifications/index" />
        <Stack.Screen name="favorites" />
        <Stack.Screen name="promote" />
        <Stack.Screen name="subscription" />
        <Stack.Screen name="payment" />
        <Stack.Screen name="payment/checkout" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="payment/result" />
        <Stack.Screen name="payment/cancel" />
        <Stack.Screen name="fees" />
        <Stack.Screen name="profile/edit" />
        <Stack.Screen name="profile/edit/index" />
        <Stack.Screen name="profile/edit/[field]" />
        <Stack.Screen name="profile/connections" />
        <Stack.Screen name="create/listing" />
        <Stack.Screen name="create/post" />
        <Stack.Screen name="create/story" />
        <Stack.Screen name="stories/view" options={{ animation: 'fade', presentation: 'fullScreenModal' }} />
        <Stack.Screen name="info/about" />
        <Stack.Screen name="info/privacy" />
        <Stack.Screen name="info/terms" />
        <Stack.Screen name="info/contact" />
        <Stack.Screen name="info/refund" />
        <Stack.Screen name="info/policies" />
        <Stack.Screen name="info/policy/[slug]" />
        <Stack.Screen name="settings/index" />
        <Stack.Screen name="settings/account" />
        <Stack.Screen name="settings/blocked" />
        <Stack.Screen name="settings/info" />
        <Stack.Screen name="settings/support" />
        <Stack.Screen
          name="support/index"
          options={{
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            headerShown: false,
          }}
        />
        <Stack.Screen name="support/faq" />
        <Stack.Screen name="support/verification" />
        <Stack.Screen name="support/tickets/index" />
        <Stack.Screen name="support/tickets/create" />
        <Stack.Screen name="support/tickets/[id]" />
        <Stack.Screen
          name="support/help"
          options={{
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            headerShown: false,
          }}
        />
        <Stack.Screen name="onboarding/index" options={{ animation: 'fade', presentation: 'card', gestureEnabled: false }} />
        <Stack.Screen name="auth/welcome" options={{ animation: 'fade', presentation: 'card' }} />
        <Stack.Screen name="auth/phone" options={{ animation: 'fade', presentation: 'card' }} />
        <Stack.Screen name="auth/otp" options={{ animation: 'fade', presentation: 'card' }} />
        <Stack.Screen name="auth/register" options={{ animation: 'fade', presentation: 'card' }} />
        <Stack.Screen name="auth/forgot-password" options={{ animation: 'fade', presentation: 'card' }} />
        <Stack.Screen name="expo-auth-session" options={{ animation: 'none', headerShown: false }} />
        <Stack.Screen name="live/create" options={{ freezeOnBlur: false }} />
        <Stack.Screen name="live/broadcast" options={{ freezeOnBlur: false }} />
        <Stack.Screen name="live/watch/[id]" options={{ freezeOnBlur: false }} />
      </Stack>
    </>
  );

  return <SarhPatternBackground>{stack}</SarhPatternBackground>;
}

function RootLayoutBody() {
  const { colors } = useTheme();
  useEffect(() => {
    void setupRtlFromStorage(AsyncStorage.getItem);
  }, []);

  return (
    <View style={[styles.rtlRoot, { backgroundColor: colors.screenRoot }, getRtlDirection()]}>
      <AuthProvider>
        <OnboardingProvider>
          <BootSplashGate>
            <AppProvider>
              <AuthGuard>
                <NotificationManager />
                <SubscriptionProvider>
                  <NavigationPathTracker />
                  <RootNavigator />
                  <ActionSheetHost />
                  <ListingCovenantHost />
                  <ToastHost />
                </SubscriptionProvider>
              </AuthGuard>
            </AppProvider>
          </BootSplashGate>
        </OnboardingProvider>
      </AuthProvider>
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutBody />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  rtlRoot: {
    flex: 1,
  },
});
