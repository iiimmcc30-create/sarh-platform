import type { FeatureValueType, PlanAudience } from '@prisma/client';

export type PlanFeatureCatalogItem = {
  key: string;
  labelAr: string;
  descriptionAr: string;
  valueType: FeatureValueType;
  audiences: PlanAudience[];
  suggestedValue?: string;
};

export const PLAN_FEATURE_CATALOG: PlanFeatureCatalogItem[] = [
  {
    key: 'maxAdsPer24Hours',
    labelAr: 'الحد الأقصى للإعلانات يومياً',
    descriptionAr: 'عدد الإعلانات المسموح نشرها خلال 24 ساعة (-1 = غير محدود)',
    valueType: 'NUMBER',
    audiences: ['USER'],
    suggestedValue: '1',
  },
  {
    key: 'monthlyFeaturedAds',
    labelAr: 'إعلانات مميزة شهرياً',
    descriptionAr: 'عدد الإعلانات المميزة المسموح بها كل شهر',
    valueType: 'NUMBER',
    audiences: ['USER'],
    suggestedValue: '0',
  },
  {
    key: 'monthlyPinnedAds',
    labelAr: 'إعلانات مثبتة شهرياً',
    descriptionAr: 'عدد الإعلانات المثبتة المسموح بها كل شهر',
    valueType: 'NUMBER',
    audiences: ['USER'],
    suggestedValue: '0',
  },
  {
    key: 'monthlyLiveHours',
    labelAr: 'ساعات البث المباشر شهرياً',
    descriptionAr: 'حصة البث المباشر بالساعات كل شهر',
    valueType: 'NUMBER',
    audiences: ['USER', 'BUTCHER'],
    suggestedValue: '0',
  },
  {
    key: 'canCreateLive',
    labelAr: 'السماح بالبث المباشر',
    descriptionAr: 'تفعيل/إيقاف إنشاء البث المباشر',
    valueType: 'BOOLEAN',
    audiences: ['USER', 'BUTCHER'],
    suggestedValue: 'false',
  },
  {
    key: 'verifiedBadge',
    labelAr: 'شارة التوثيق',
    descriptionAr: 'إظهار شارة التوثيق للحساب',
    valueType: 'BOOLEAN',
    audiences: ['USER', 'BUTCHER'],
    suggestedValue: 'false',
  },
  {
    key: 'prioritySupport',
    labelAr: 'دعم فني بأولوية',
    descriptionAr: 'أولوية في خدمة الدعم',
    valueType: 'BOOLEAN',
    audiences: ['USER', 'BUTCHER'],
    suggestedValue: 'false',
  },
  {
    key: 'prioritySearch',
    labelAr: 'أولوية في نتائج البحث',
    descriptionAr: 'ترتيب أعلى داخل نتائج البحث',
    valueType: 'BOOLEAN',
    audiences: ['USER', 'BUTCHER'],
    suggestedValue: 'false',
  },
  {
    key: 'priorityHome',
    labelAr: 'ظهور مميز في الرئيسية',
    descriptionAr: 'أولوية الظهور في الصفحة الرئيسية',
    valueType: 'BOOLEAN',
    audiences: ['USER'],
    suggestedValue: 'false',
  },
  {
    key: 'storeEnabled',
    labelAr: 'تفعيل المتجر',
    descriptionAr: 'السماح باستخدام المتجر للحساب',
    valueType: 'BOOLEAN',
    audiences: ['BUTCHER'],
    suggestedValue: 'true',
  },
  {
    key: 'receiveOrders',
    labelAr: 'استقبال الطلبات',
    descriptionAr: 'السماح باستقبال طلبات الشراء',
    valueType: 'BOOLEAN',
    audiences: ['BUTCHER'],
    suggestedValue: 'true',
  },
  {
    key: 'analyticsDashboard',
    labelAr: 'لوحة التحليلات',
    descriptionAr: 'إتاحة لوحات وتقارير الإحصائيات',
    valueType: 'BOOLEAN',
    audiences: ['BUTCHER'],
    suggestedValue: 'true',
  },
  {
    key: 'storeCommission',
    labelAr: 'عمولة المتجر',
    descriptionAr:
      'علم إعفاء عمولات الملحمة (إعلان + طلبات مكتملة). 0 = معفى بالاشتراك، أي قيمة > 0 = تُحسب عمولة المنصة (النسبة ثابتة في الكود وليست قيمة هذا الحقل)',
    valueType: 'NUMBER',
    audiences: ['BUTCHER'],
    suggestedValue: '1',
  },
];

export const PLAN_FEATURE_LABELS_AR = Object.fromEntries(
  PLAN_FEATURE_CATALOG.map((item) => [item.key, item.labelAr]),
) as Record<string, string>;
