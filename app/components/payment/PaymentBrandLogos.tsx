import { Text, View } from 'react-native';
import type { NIPaymentMethod } from '@/services/network_international';

export function MadaLogo({ size = 32 }: { size?: number }) {
  return (
    <View
      style={{
        width: size * 1.9,
        height: size,
        borderRadius: size * 0.25,
        backgroundColor: '#005BAA',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: '#fff',
          fontWeight: '600',
          fontSize: size * 0.45,
          letterSpacing: 1,
        }}
      >
        mada
      </Text>
    </View>
  );
}

export function VisaLogo({ size = 32 }: { size?: number }) {
  return (
    <View
      style={{
        width: size * 1.9,
        height: size,
        borderRadius: size * 0.25,
        backgroundColor: '#1A1F71',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: '#fff',
          fontStyle: 'italic',
          fontWeight: '600',
          fontSize: size * 0.55,
          letterSpacing: -1,
        }}
      >
        VISA
      </Text>
    </View>
  );
}

export function ApplePayLogo({ size = 32 }: { size?: number }) {
  return (
    <View
      style={{
        width: size * 2.4,
        height: size,
        borderRadius: size * 0.25,
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 3,
      }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.52, marginBottom: 2 }}></Text>
      <Text style={{ color: '#fff', fontWeight: '600', fontSize: size * 0.4 }}>Pay</Text>
    </View>
  );
}

export function StcPayLogo({ size = 32 }: { size?: number }) {
  return (
    <View
      style={{
        width: size * 2.2,
        height: size,
        borderRadius: size * 0.25,
        backgroundColor: '#4F008C',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: '#fff',
          fontWeight: '600',
          fontSize: size * 0.4,
          letterSpacing: 0.5,
        }}
      >
        stc pay
      </Text>
    </View>
  );
}

export function MastercardLogo({ size = 32 }: { size?: number }) {
  const r = size * 0.46;
  return (
    <View style={{ width: size * 1.9, height: size, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}>
      <View style={{ width: r * 2, height: r * 2, borderRadius: r, backgroundColor: '#EB001B' }} />
      <View style={{ width: r * 2, height: r * 2, borderRadius: r, backgroundColor: '#F79E1B', marginStart: -r * 0.72, opacity: 0.95 }} />
    </View>
  );
}

export function PaymentBrandLogo({ id, size = 32 }: { id: NIPaymentMethod; size?: number }) {
  switch (id) {
    case 'mada':
      return <MadaLogo size={size} />;
    case 'visa':
      return <VisaLogo size={size} />;
    case 'mastercard':
      return <MastercardLogo size={size} />;
    case 'apple_pay':
      return <ApplePayLogo size={size} />;
    case 'stc_pay':
      return <StcPayLogo size={size} />;
  }
}

export const FEE_PAYMENT_METHODS: Array<{
  id: NIPaymentMethod;
  labelAr: string;
}> = [
  { id: 'mada', labelAr: 'مدى' },
  { id: 'visa', labelAr: 'Visa' },
  { id: 'apple_pay', labelAr: 'Apple Pay' },
  { id: 'stc_pay', labelAr: 'STC Pay' },
];
