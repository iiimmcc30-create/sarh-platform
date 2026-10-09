import type { Router } from 'expo-router';
import { navigateToCreateListing } from '@/lib/navigateToCreateListing';
import { API_BASE } from '@/services/api';
import { showAlert } from '@/lib/confirmDialog';

export type LiveStreamEligibility = {
  canStream: boolean;
  listingsCount: number;
  reason?: string;
  messageAr?: string;
};

export async function fetchLiveStreamEligibility(
  accessToken: string | null,
): Promise<LiveStreamEligibility> {
  if (!accessToken) {
    return { canStream: false, listingsCount: 0 };
  }

  try {
    const res = await fetch(`${API_BASE}/api/livestreams/eligibility`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success && json.data) {
      return {
        canStream: Boolean(json.data.canStream),
        listingsCount: json.data.listingsCount ?? 0,
        reason: json.data.reason,
        messageAr: json.data.messageAr ?? json.messageAr,
      };
    }
    return {
      canStream: false,
      listingsCount: 0,
      reason: json.data?.reason ?? json.error,
      messageAr: json.data?.messageAr ?? json.messageAr,
    };
  } catch {
    // fall through
  }

  return { canStream: false, listingsCount: 0 };
}

export function showListingRequiredAlert(router: Router) {
  showAlert(
    'إعلان مطلوب',
    'لا يمكن بدء بث مباشر إلا بعد نشر إعلان واحد على الأقل في السوق.',
    [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إنشاء إعلان', onPress: () => void navigateToCreateListing() },
    ],
  );
}

export function showLiveStreamEligibilityDeniedAlert(
  router: Router,
  eligibility: Pick<LiveStreamEligibility, 'reason' | 'messageAr'> & { listingsCount?: number },
) {
  switch (eligibility.reason) {
    case 'listing_required':
      showListingRequiredAlert(router);
      return;

    case 'plan_required':
      showAlert(
        'البث المباشر غير متاح',
        eligibility.messageAr ?? 'البث المباشر غير متاح في الحساب المجاني حالياً.',
        [{ text: 'حسناً' }],
      );
      return;

    case 'weekly_limit':
    case 'live_minutes_limit':
      showAlert('البث المباشر غير متاح', eligibility.messageAr ?? 'لقد استنفدت حصة البث الأسبوعية.');
      return;

    default:
      if (eligibility.listingsCount === 0) {
        showListingRequiredAlert(router);
        return;
      }
      showAlert('البث المباشر غير متاح', eligibility.messageAr ?? 'تعذّر التحقق من أهلية البث. حاول مرة أخرى.');
  }
}

/** Starting a live broadcast is disabled until launch — watching streams stays available. */
export function showLiveBroadcastComingSoonAlert() {
  showAlert(
    'قريباً',
    'ميزة بدء البث المباشر ستتوفر قريباً مع إطلاق التطبيق.\n\nيمكنك مشاهدة البثوث الحية الآن.',
    [{ text: 'حسناً' }],
  );
}

export async function openLiveCreateIfAllowed(
  _router: Router,
  _accessToken: string | null,
  _params?: Record<string, string>,
): Promise<boolean> {
  showLiveBroadcastComingSoonAlert();
  return false;
}
