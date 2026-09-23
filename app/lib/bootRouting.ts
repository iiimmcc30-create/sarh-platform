export type BootNavState = {
  authLoading: boolean;
  onboardingLoading: boolean;
  onboardingComplete: boolean | null;
  isAuthenticated: boolean;
  firstSegment: string | undefined;
};

export type BootNavAction =
  | { type: 'wait' }
  | { type: 'stay' }
  | { type: 'replace'; href: string };

export function resolveBootNavigation(state: BootNavState): BootNavAction {
  if (state.authLoading || state.onboardingLoading) {
    return { type: 'wait' };
  }

  const seg = state.firstSegment;
  if (seg === 'expo-auth-session') {
    return { type: 'stay' };
  }

  const inOnboarding = seg === 'onboarding';
  const inAuth = seg === 'auth';
  const inInfo = seg === 'info';
  const onRootIndex = !seg || seg === 'index';

  if (!state.onboardingComplete && !inOnboarding) {
    return { type: 'replace', href: '/onboarding' };
  }

  if (state.onboardingComplete && inOnboarding) {
    return {
      type: 'replace',
      href: state.isAuthenticated ? '/(tabs)' : '/auth/welcome',
    };
  }

  if (state.isAuthenticated && inAuth) {
    return { type: 'replace', href: '/(tabs)' };
  }

  if (state.isAuthenticated && onRootIndex) {
    return { type: 'replace', href: '/(tabs)' };
  }

  if (
    !state.isAuthenticated &&
    !inAuth &&
    !inInfo &&
    !inOnboarding
  ) {
    return { type: 'replace', href: '/auth/welcome' };
  }

  return { type: 'stay' };
}
