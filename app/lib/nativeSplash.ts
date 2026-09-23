export const NATIVE_SPLASH_FALLBACK_MS = 8000;

export function shouldHideNativeSplash(input: {
  fontsReady: boolean;
  authReady: boolean;
  onboardingReady: boolean;
  timedOut: boolean;
}): boolean {
  if (input.timedOut) return true;
  return input.fontsReady && input.authReady && input.onboardingReady;
}

export type AuthBootPhase =
  | 'initial_loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'transient_refresh_failure'
  | 'definitive_auth_failure';

export function resolveAuthBootPhase(input: {
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshKind?: 'success' | 'transient_failure' | 'definitive_failure' | null;
}): AuthBootPhase {
  if (input.isLoading) return 'initial_loading';
  if (input.refreshKind === 'transient_failure') {
    return 'transient_refresh_failure';
  }
  if (input.refreshKind === 'definitive_failure') {
    return 'definitive_auth_failure';
  }
  return input.isAuthenticated ? 'authenticated' : 'unauthenticated';
}
