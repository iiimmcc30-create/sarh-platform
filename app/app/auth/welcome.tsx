import { Redirect } from 'expo-router';

/**
 * The old welcome screen was removed from the launch path. This route stays only
 * so stale links / history entries land on login instead of a 404.
 */
export default function AuthWelcomeRedirect() {
  return <Redirect href="/auth/phone" />;
}
