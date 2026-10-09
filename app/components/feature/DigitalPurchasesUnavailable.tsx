import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/design-system/layout';
import {
  DIGITAL_PURCHASES_UNAVAILABLE_BODY_AR,
  DIGITAL_PURCHASES_UNAVAILABLE_TITLE_AR,
} from '@/lib/storePurchases';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * Shown instead of a digital-purchase screen (subscriptions, verification plans,
 * boosts) in store builds where those purchases are disabled — e.g. when the
 * screen is opened from a deep link, a notification or an old in-app link.
 */
export function DigitalPurchasesUnavailable({ title }: { title?: string }) {
  const router = useRouter();
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as never);
  }, [router]);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title={title ?? DIGITAL_PURCHASES_UNAVAILABLE_TITLE_AR} showBack onBackPress={goBack} />
      <EmptyState
        icon="time-outline"
        title={DIGITAL_PURCHASES_UNAVAILABLE_TITLE_AR}
        description={DIGITAL_PURCHASES_UNAVAILABLE_BODY_AR}
        actionLabel="العودة"
        onAction={goBack}
      />
    </Screen>
  );
}
