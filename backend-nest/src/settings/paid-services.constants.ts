/** AppSetting keys for independently toggling paid listing services. */
export const PAID_SERVICE_SETTING_KEYS = {
  promotion: 'features.paidPromotionEnabled',
  pin: 'features.paidPinEnabled',
  feature: 'features.paidFeatureEnabled',
  listingFees: 'features.listingFeesEnabled',
} as const;

export type PaidServiceFlags = {
  /** ترويج الظهور */
  promotionEnabled: boolean;
  /** تثبيت الإعلان */
  pinEnabled: boolean;
  /** تمييز الإعلان */
  featureEnabled: boolean;
  /** سداد الرسوم / التعهد / عمولة / زر ترقية الإعلان */
  listingFeesEnabled: boolean;
};

export const DEFAULT_PAID_SERVICE_FLAGS: PaidServiceFlags = {
  promotionEnabled: true,
  pinEnabled: true,
  featureEnabled: true,
  listingFeesEnabled: true,
};

export const PAID_SERVICE_SETTING_DEFAULTS = [
  {
    key: PAID_SERVICE_SETTING_KEYS.promotion,
    value: true,
    labelAr: 'ترويج الإعلان (الظهور المدفوع)',
    category: 'paid_services',
  },
  {
    key: PAID_SERVICE_SETTING_KEYS.pin,
    value: true,
    labelAr: 'تثبيت الإعلان',
    category: 'paid_services',
  },
  {
    key: PAID_SERVICE_SETTING_KEYS.feature,
    value: true,
    labelAr: 'تمييز الإعلان',
    category: 'paid_services',
  },
  {
    key: PAID_SERVICE_SETTING_KEYS.listingFees,
    value: true,
    labelAr: 'سداد الرسوم والتعهد وزر ترقية الإعلان',
    category: 'paid_services',
  },
] as const;
