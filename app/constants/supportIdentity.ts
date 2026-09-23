import type { ImageSourcePropType } from 'react-native';

/**
 * Single source for Sarhan / customer-service identity.
 * Do not duplicate this asset path in other files.
 */
export const SARHAN_AVATAR: ImageSourcePropType = require('../assets/images/sarhan-avatar.jpg');

export const SUPPORT_CUSTOMER_SERVICE = {
  name: 'خدمة العملاء',
  assistantName: 'سرحان',
  avatarSource: SARHAN_AVATAR,
} as const;
