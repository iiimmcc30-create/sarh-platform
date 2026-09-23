export type NIPaymentMethod = 'mada' | 'visa' | 'mastercard' | 'apple_pay' | 'stc_pay';

export interface PaymentMethodItem {
  id: NIPaymentMethod;
  arabic: string;
  english: string;
  icon: string;
  color: string;
}

export const PAYMENT_METHODS: PaymentMethodItem[] = [
  { id: 'mada', arabic: 'مدى', english: 'Mada', icon: '💳', color: '#0054A6' },
  { id: 'visa', arabic: 'فيزا', english: 'Visa', icon: '💳', color: '#1A1F71' },
  { id: 'mastercard', arabic: 'ماستركارد', english: 'Mastercard', icon: '💳', color: '#EB001B' },
  { id: 'apple_pay', arabic: 'Apple Pay', english: 'Apple Pay', icon: '📱', color: '#000000' },
  { id: 'stc_pay', arabic: 'stc pay', english: 'stc pay', icon: '💸', color: '#4F008C' },
];
