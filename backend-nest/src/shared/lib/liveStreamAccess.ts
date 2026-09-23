/** @deprecated Use SubscriptionEntitlementService.assertCanCreateLiveStream */
export type LiveStreamSubscription = {
  planId: string;
  liveMinutesUsed: number;
};

export type LiveStreamAccessDenied = {
  allowed: false;
  code: 'plan_required' | 'live_minutes_limit';
  messageAr: string;
  planId: string;
};

export type LiveStreamAccessGranted = {
  allowed: true;
  planId: string;
  liveMinutesLimit: number;
  liveMinutesUsed: number;
};

export type LiveStreamAccessResult =
  LiveStreamAccessDenied | LiveStreamAccessGranted;

/** @deprecated — live access is enforced via SubscriptionEntitlementService */
export function checkLiveStreamAccess(
  sub: LiveStreamSubscription | null,
): LiveStreamAccessResult {
  const planId = sub?.planId ?? 'free';
  const liveMinutesUsed = sub?.liveMinutesUsed ?? 0;
  return {
    allowed: false,
    code: 'plan_required',
    messageAr:
      'البث المباشر غير متاح في باقتك. قم بالترقية لبدء البث.',
    planId,
  };
}
