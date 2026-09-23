import { router } from 'expo-router';
import { requestListingCovenant } from '@/lib/listingCovenant';
import { isNavigationLocked, safePush } from '@/lib/safeNavigate';
import { fetchPaidServiceFlags } from '@/services/paidServices';

/** Navigate to create listing after معاهدة سرح (skipped for edit flow / when fees disabled unless required). */
export async function navigateToCreateListing(options?: {
  editId?: string;
  requireCovenant?: boolean;
}) {
  if (isNavigationLocked()) return;

  if (options?.editId) {
    safePush(
      {
        pathname: '/create/listing',
        params: { editId: options.editId },
      },
      undefined,
      router,
    );
    return;
  }

  if (!options?.requireCovenant) {
    const flags = await fetchPaidServiceFlags();
    if (!flags.listingFeesEnabled) {
      safePush('/create/listing', undefined, router);
      return;
    }
  }

  const accepted = await requestListingCovenant();
  if (accepted) {
    safePush('/create/listing', undefined, router);
  }
}
