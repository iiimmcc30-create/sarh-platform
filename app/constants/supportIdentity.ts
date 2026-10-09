import type { ImageSourcePropType } from 'react-native';
import { SUPPORT_ASSISTANT_NAME } from './supportAssistant';

/**
 * Single source for «مساعد سرح» / customer-service identity.
 * Do not duplicate this asset path in other files.
 */
export const SARHAN_AVATAR: ImageSourcePropType = require('../assets/images/sarhan-avatar.jpg');

export const SUPPORT_CUSTOMER_SERVICE = {
  name: 'خدمة العملاء',
  assistantName: SUPPORT_ASSISTANT_NAME,
  avatarSource: SARHAN_AVATAR,
} as const;
