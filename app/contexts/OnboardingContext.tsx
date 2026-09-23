import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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
    await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
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
