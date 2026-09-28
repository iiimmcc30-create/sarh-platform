import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { persistOnboardingComplete } from '@/lib/onboardingFlow';

export const ONBOARDING_STORAGE_KEY = 'safat_onboarding_complete';

type OnboardingContextValue = {
  isComplete: boolean | null;
  isLoading: boolean;
  completeOnboarding: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [isComplete, setIsComplete] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(ONBOARDING_STORAGE_KEY)
      .then((value) => {
        if (mounted) setIsComplete(value === 'true');
      })
      .catch(() => {
        if (mounted) setIsComplete(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    // A storage failure must not trap the user on onboarding: complete for
    // this session anyway (the flag is retried next time onboarding finishes).
    await persistOnboardingComplete(
      (key, value) => AsyncStorage.setItem(key, value),
      ONBOARDING_STORAGE_KEY,
    );
    setIsComplete(true);
  }, []);

  const value = useMemo(
    () => ({
      isComplete,
      isLoading: isComplete === null,
      completeOnboarding,
    }),
    [isComplete, completeOnboarding],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
