export type NotificationJob = {
  userId: string;
  type: string;
  titleAr: string;
  bodyAr: string;
  data?: Record<string, string>;
};

export type EmailJob = {
  to: string;
  subject: string;
  template: string;
  variables: Record<string, string>;
};

export type PushJob = {
  fcmToken: string;
  titleAr: string;
  bodyAr: string;
  data?: Record<string, string>;
};

export type FeeCheckJob = {
  listingFeeId: string;
  userId: string;
  amount: number;
};

export type ImageJob = {
  fileKey: string;
  bucket: string;
  operations: ('resize' | 'webp' | 'thumbnail')[];
};

export type SubscriptionJob =
  | { kind: 'expire' }
  | { kind: 'reminders' }
  | { kind: 'reset_live_minutes' }
  | { kind: 'auto_renew_attempt'; userId: string; subscriptionId: string };

export type NotifyUserInput = {
  userId: string;
  type: string;
  titleAr: string;
  bodyAr: string;
  data?: Record<string, string | number | boolean | null | undefined>;
};
