import { useFlaticonFonts } from '@/hooks/useFlaticonFonts';
import { applyAppFonts } from '@/lib/applyAppFonts';
import {
  NATIVE_SPLASH_FALLBACK_MS,
  shouldHideNativeSplash,
} from '@/lib/nativeSplash';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { markPerf } from '@/lib/perfDev';
import { LaunchSplash } from '@/components/ui/LaunchSplash';

/** The animated launch splash is a native-app moment; web keeps its instant first paint. */
const SHOW_LAUNCH_SPLASH = Platform.OS !== 'web';

type BootSplashGateProps = {
  children: ReactNode;
};

/**
 * Boot sequencing:
 * - Native splash (plain white) stays until fonts are ready and the in-app
 *   `LaunchSplash` has laid out its first frame; it then hides itself.
 * - `LaunchSplash` covers the navigator until its intro finished AND auth /
 *   onboarding bootstrap is ready, then fades to whatever AuthGuard routed to.
 * - A fallback timeout keeps a slow network from pinning either splash.
 */
export function BootSplashGate({ children }: BootSplashGateProps) {
  const { loaded: fontsLoaded, error: fontError } = useFlaticonFonts();
  const { isLoading: authLoading } = useAuth();
  const { isLoading: onboardingLoading } = useOnboarding();
  const [timedOut, setTimedOut] = useState(false);

  const fontsReady = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), NATIVE_SPLASH_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (fontsReady) applyAppFonts();
  }, [fontsReady]);

  const bootReady = shouldHideNativeSplash({
    fontsReady,
    authReady: !authLoading,
    onboardingReady: !onboardingLoading,
    timedOut,
  });

  useEffect(() => {
    if (SHOW_LAUNCH_SPLASH || !bootReady) return;
    markPerf('native-splash-hide');
    void SplashScreen.hideAsync().catch(() => {});
  }, [bootReady]);

  return (
    <>
      {children}
      {SHOW_LAUNCH_SPLASH ? (
        <LaunchSplash nativeReady={fontsReady || timedOut} bootReady={bootReady} />
      ) : null}
    </>
  );
}
