export type SaudiCity = {
  id: string;
  nameAr: string;
  nameEn: string;
};

export type SaudiRegion = {
  id: string;
  nameAr: string;
  nameEn: string;
  cities: SaudiCity[];
};

/** المملكة — 13 منطقة + مدن رئيسية (للفلترة والبحث الذكي). */
export const SAUDI_REGIONS: SaudiRegion[] = [
  {
    id: 'riyadh',
    nameAr: 'منطقة الرياض',
    nameEn: 'Riyadh',
    cities: [
      { id: 'riyadh-city', nameAr: 'الرياض', nameEn: 'Riyadh' },
      { id: 'diriyah', nameAr: 'الدرعية', nameEn: 'Diriyah' },
      { id: 'kharj', nameAr: 'الخرج', nameEn: 'Al Kharj' },
      { id: 'dawadmi', nameAr: 'الدوادمي', nameEn: 'Dawadmi' },
      { id: 'majmaah', nameAr: 'المجمعة', nameEn: 'Al Majmaah' },
      { id: 'zulfi', nameAr: 'الزلفي', nameEn: 'Az Zulfi' },
      { id: 'duruma', nameAr: 'ضرماء', nameEn: 'Duruma' },
      { id: 'muzahmiyah', nameAr: 'المزاحمية', nameEn: 'Al Muzahimiyah' },
    ],
  },
  {
    id: 'makkah',
    nameAr: 'منطقة مكة المكرمة',
    nameEn: 'Makkah',
    cities: [
      { id: 'makkah-city', nameAr: 'مكة المكرمة', nameEn: 'Makkah' },
      { id: 'jeddah', nameAr: 'جدة', nameEn: 'Jeddah' },
      { id: 'taif', nameAr: 'الطائف', nameEn: 'Taif' },
      { id: 'rabigh', nameAr: 'رابغ', nameEn: 'Rabigh' },
      { id: 'qunfudhah', nameAr: 'القنفذة', nameEn: 'Qunfudhah' },
    ],
  },
  {
    id: 'madinah',
    nameAr: 'منطقة المدينة المنورة',
    nameEn: 'Madinah',
    cities: [
      { id: 'madinah-city', nameAr: 'المدينة المنورة', nameEn: 'Madinah' },
      { id: 'yanbu', nameAr: 'ينبع', nameEn: 'Yanbu' },
      { id: 'ula', nameAr: 'العلا', nameEn: 'Al Ula' },
      { id: 'badr', nameAr: 'بدر', nameEn: 'Badr' },
    ],
  },
  {
    id: 'qassim',
    nameAr: 'منطقة القصيم',
    nameEn: 'Qassim',
    cities: [
      { id: 'buraidah', nameAr: 'بريدة', nameEn: 'Buraidah' },
      { id: 'unayzah', nameAr: 'عنيزة', nameEn: 'Unaizah' },
      { id: 'rass', nameAr: 'الرس', nameEn: 'Ar Rass' },
    ],
  },
  {
    id: 'eastern',
    nameAr: 'المنطقة الشرقية',
    nameEn: 'Eastern',
    cities: [
      { id: 'dammam', nameAr: 'الدمام', nameEn: 'Dammam' },
      { id: 'khobar', nameAr: 'الخبر', nameEn: 'Khobar' },
      { id: 'dhahran', nameAr: 'الظهران', nameEn: 'Dhahran' },
      { id: 'jubail', nameAr: 'الجبيل', nameEn: 'Jubail' },
      { id: 'ahsa', nameAr: 'الأحساء', nameEn: 'Al Ahsa' },
      { id: 'qatif', nameAr: 'القطيف', nameEn: 'Qatif' },
      { id: 'hafr-albatin', nameAr: 'حفر الباطن', nameEn: 'Hafr Al Batin' },
    ],
  },
  {
    id: 'asir',
    nameAr: 'منطقة عسير',
    nameEn: 'Asir',
    cities: [
      { id: 'abha', nameAr: 'أبها', nameEn: 'Abha' },
      { id: 'khamis', nameAr: 'خميس مشيط', nameEn: 'Khamis Mushait' },
      { id: 'bisha', nameAr: 'بيشة', nameEn: 'Bisha' },
    ],
  },
  {
    id: 'tabuk',
    nameAr: 'منطقة تبوك',
    nameEn: 'Tabuk',
    cities: [
      { id: 'tabuk-city', nameAr: 'تبوك', nameEn: 'Tabuk' },
      { id: 'wajh', nameAr: 'الوجه', nameEn: 'Al Wajh' },
      { id: 'duba', nameAr: 'ضباء', nameEn: 'Duba' },
    ],
  },
  {
    id: 'hail',
    nameAr: 'منطقة حائل',
    nameEn: 'Hail',
    cities: [
      { id: 'hail-city', nameAr: 'حائل', nameEn: 'Hail' },
      { id: 'baga', nameAr: 'بقعاء', nameEn: 'Baqaa' },
    ],
  },
  {
    id: 'northern',
    nameAr: 'منطقة الحدود الشمالية',
    nameEn: 'Northern Borders',
    cities: [
      { id: 'arar', nameAr: 'عرعر', nameEn: 'Arar' },
      { id: 'rafha', nameAr: 'رفحاء', nameEn: 'Rafha' },
    ],
  },
  {
    id: 'jazan',
    nameAr: 'منطقة جazan',
    nameEn: 'Jazan',
    cities: [
      { id: 'jazan-city', nameAr: 'جazan', nameEn: 'Jazan' },
      { id: 'sabya', nameAr: 'صبيا', nameEn: 'Sabya' },
    ],
  },
  {
    id: 'najran',
    nameAr: 'منطقة نجران',
    nameEn: 'Najran',
    cities: [
      { id: 'najran-city', nameAr: 'نجران', nameEn: 'Najran' },
      { id: 'sharurah', nameAr: 'شرورة', nameEn: 'Sharurah' },
    ],
  },
  {
    id: 'bahah',
    nameAr: 'منطقة الباحة',
    nameEn: 'Al Bahah',
    cities: [
      { id: 'bahah-city', nameAr: 'الباحة', nameEn: 'Al Bahah' },
      { id: 'mandaq', nameAr: 'المندق', nameEn: 'Al Mandaq' },
    ],
  },
  {
    id: 'jawf',
    nameAr: 'منطقة الجوف',
    nameEn: 'Al Jawf',
    cities: [
      { id: 'sakaka', nameAr: 'سكاكا', nameEn: 'Sakaka' },
      { id: 'qurayyat', nameAr: 'القريات', nameEn: 'Al Qurayyat' },
    ],
  },
];

export type RegionSelection =
  | { type: 'all' }
  | { type: 'region'; region: SaudiRegion }
  | { type: 'city'; region: SaudiRegion; city: SaudiCity };

export const ALL_REGIONS_LABEL = 'كل المناطق';

/** Featured city chips shown in the region picker sheet. */
export const SAUDI_MAIN_CITIES: Array<{
  regionId: string;
  cityId: string;
}> = [
  { regionId: 'eastern', cityId: 'dammam' },
  { regionId: 'riyadh', cityId: 'riyadh-city' },
  { regionId: 'makkah', cityId: 'jeddah' },
  { regionId: 'madinah', cityId: 'madinah-city' },
  { regionId: 'makkah', cityId: 'makkah-city' },
];

export function resolveSaudiMainCities(): Array<{
  region: SaudiRegion;
  city: SaudiCity;
}> {
  const out: Array<{ region: SaudiRegion; city: SaudiCity }> = [];
  for (const ref of SAUDI_MAIN_CITIES) {
    const region = SAUDI_REGIONS.find((r) => r.id === ref.regionId);
    const city = region?.cities.find((c) => c.id === ref.cityId);
    if (region && city) out.push({ region, city });
  }
  return out;
}
