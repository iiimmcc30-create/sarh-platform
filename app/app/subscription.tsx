import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { DigitalPurchasesUnavailable } from '@/components/feature/DigitalPurchasesUnavailable';
import { digitalPurchasesEnabled } from '@/lib/storePurchases';

/** Legacy route — redirects to the new promotion hub (or «غير متاحة حالياً» in store builds). */
function SubscriptionLegacyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/promote' as never);
  }, [router]);
  return null;
}

export default function SubscriptionRoute() {
  if (!digitalPurchasesEnabled()) return <DigitalPurchasesUnavailable title="الاشتراكات" />;
  return <SubscriptionLegacyRedirect />;
}
