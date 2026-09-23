import { useFlaticonFonts } from '@/hooks/useFlaticonFonts';
import { applyAppFonts } from '@/lib/applyAppFonts';
import {
  NATIVE_SPLASH_FALLBACK_MS,
  shouldHideNativeSplash,
} from '@/lib/nativeSplash';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useEffect, useState, type ReactNode } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { markPerf } from '@/lib/perfDev';

type BootSplashGateProps = {
  children: ReactNode;
};

/**
 * Holds the native splash until fonts and auth/onboarding bootstrap are ready,
 * with a fallback timeout so a slow network cannot pin the splash forever.
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

  useEffect(() => {
    if (
      shouldHideNativeSplash({
        fontsReady,
        authReady: !authLoading,
        onboardingReady: !onboardingLoading,
        timedOut,
      })
    ) {
      markPerf('native-splash-hide');
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsReady, authLoading, onboardingLoading, timedOut]);

  return <>{children}</>;
}
