import { publicJoinBodySchema } from '../../routes/publicJoin.schema';

const valid = {
  phone: '+966501234567',
  phone_token: 'x'.repeat(20),
  displayName: 'أحمد',
  username: 'ahmad_join',
  accountUsername: 'nakheel_shop',
  accountPassword: 'secret1',
  accountPasswordConfirm: 'secret1',
  acceptedTerms: true,
  confirmAccuracy: true,
  nameAr: 'ملحمة النخيل',
  nameEn: 'Nakheel Butcher',
  shopPhone: '+966501234567',
  commercialReg: 'CR-12345',
  country: 'SA',
  city: 'Riyadh',
  cityAr: 'الرياض',
  address: 'Olaya street',
  addressAr: 'شارع العليا',
  lat: 24.7,
  lng: 46.7,
  openTime: '08:00',
  closeTime: '22:00',
};

describe('publicJoinBodySchema', () => {
  it('accepts the authenticated butcher-application snapshot fields', () => {
    expect(publicJoinBodySchema.safeParse(valid).success).toBe(true);
  });

  it('coerces multipart string numbers and checkbox strings', () => {
    const parsed = publicJoinBodySchema.safeParse({
      ...valid,
      lat: '24.7136',
      lng: '46.6753',
      acceptedTerms: 'true',
      confirmAccuracy: 'true',
      specialties: 'لحم,غنم',
      email: '',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.lat).toBeCloseTo(24.7136);
      expect(parsed.data.specialties).toEqual(['لحم', 'غنم']);
      expect(parsed.data.email).toBeUndefined();
    }
  });

  it('rejects missing terms and 0,0 map coordinates', () => {
    expect(
      publicJoinBodySchema.safeParse({ ...valid, acceptedTerms: false }).success,
    ).toBe(false);
    expect(
      publicJoinBodySchema.safeParse({ ...valid, confirmAccuracy: false })
        .success,
    ).toBe(false);
    expect(
      publicJoinBodySchema.safeParse({ ...valid, lat: 0, lng: 0 }).success,
    ).toBe(false);
    expect(
      publicJoinBodySchema.safeParse({
        ...valid,
        accountPasswordConfirm: 'other',
      }).success,
    ).toBe(false);
  });
});
