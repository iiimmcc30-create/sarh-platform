import { useEffect } from 'react';
import { useRouter } from 'expo-router';

/** Legacy route — redirects to the new promotion hub. */
export default function SubscriptionLegacyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/promote' as never);
  }, [router]);
  return null;
}
