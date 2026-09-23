# SAFAT — قسم الملاحم | Integration Guide
> Powered by OnSpace.AI

---

## 📁 هيكل الملفات المنشأة

```
frontend/
├── app/butchers/
│   ├── _layout.tsx          ← Stack navigator لجميع شاشات الملاحم
│   ├── index.tsx            ← قائمة الملاحم + فلاتر + قصص
│   ├── [id].tsx             ← ملف الجزار (تابات: منتجات، عروض، قصص، عن، محادثة)
│   ├── order.tsx            ← شاشة الطلب (اختيار منتج + تقطيع + توصيل)
│   ├── order-success.tsx    ← تأكيد إرسال الطلب
│   ├── chat.tsx             ← محادثة العميل مع الجزار
│   ├── register.tsx         ← تسجيل ملحمة جديدة (عادي أو موثّق)
│   ├── dashboard.tsx        ← لوحة تحليلات الجزار الموثّق
│   ├── manage.tsx           ← إدارة الطلبات + المنتجات + العروض + القصص
│   ├── map.tsx              ← خريطة الملاحم في منطقة الخليج
│   └── story-viewer.tsx     ← مشاهد القصص (progress bar + ردود)
│
├── services/
│   └── butcherData.ts       ← كل الأنواع + البيانات التجريبية + دوال المساعدة
│
├── hooks/
│   └── useButcher.ts        ← Hook رئيسي: فلترة، ترتيب، قصص، بيانات الجزار المختار
│
└── components/feature/
    ├── ButcherCard.tsx          ← مكوّن بطاقة الجزار (variant: full | compact)
    ├── ButcherMiniSection.tsx   ← قسم مُصغَّر للصفحة الرئيسية (قصص + بطاقات)
    └── ButchersSidebarEntry.tsx ← إدخال قسم الملاحم في sidebar
```

---

## 🔗 ربط الملاحم بـ Sidebar

في `app/sidebar.tsx`، أضف داخل `<ScrollView>` قبل قسم Account:

```tsx
import { ButchersSidebarEntry } from '@/components/feature/ButchersSidebarEntry';

// داخل ScrollView:
<ButchersSidebarEntry />
```

---

## 🏠 إضافة الملاحم للصفحة الرئيسية

في أي Tab Screen (مثل `(tabs)/index.tsx`):

```tsx
import { ButcherMiniSection } from '@/components/feature/ButcherMiniSection';

// داخل ScrollView:
<ButcherMiniSection showStories={true} limit={5} />
```

---

## 🧭 التنقل بين الشاشات

```tsx
// الشاشة الرئيسية للملاحم
router.push('/butchers');

// ملف جزار محدد
router.push({ pathname: '/butchers/[id]', params: { id: 'b1' } });

// طلب منتج
router.push({ pathname: '/butchers/order', params: { butcherId: 'b1', productId: 'p1' } });

// محادثة
router.push({ pathname: '/butchers/chat', params: { butcherId: 'b1' } });

// تسجيل ملحمة
router.push('/butchers/register');

// الخريطة
router.push('/butchers/map');

// مشاهد القصص
router.push({ pathname: '/butchers/story-viewer', params: { butcherId: 'b1', storyId: 'bs1' } });
```

---

## 🪝 استخدام useButcher Hook

```tsx
import { useButcher } from '@/hooks/useButcher';

function MyScreen() {
  const {
    filteredButchers,
    stories,
    unseenCount,
    filter,
    setCountry,
    setVerifiedOnly,
    setSearchQuery,
    markStorySeen,
    stats,
  } = useButcher();

  // filteredButchers: مرتبة + مفلترة جاهزة للعرض
  // stats.verified: عدد الموثّقين
  // unseenCount: عدد القصص غير المشاهدة
}
```

---

## 💰 نموذج التمويل

| | جزار عادي | جزار موثّق |
|---|---|---|
| الرسوم الشهرية | مجاني | ٢٩٩ ر.س (يتفاوت بالعملة) |
| العمولة | ٨–١٢٪ لكل طلب | لا عمولة |
| شارة التوثيق | ✗ | ✅ |
| أولوية البحث | ✗ | ✅ أول النتائج |
| نشر القصص | ✗ | ✅ |
| لوحة التحليلات | ✗ | ✅ |
| دعم أولوية | ✗ | ✅ |

---

## 📊 منطق الترتيب

```
rankButchers() → يرتب حسب:
  1. subscriptionActive (موثّق أولاً)
  2. rating (التقييم الأعلى)
  3. orderCompletionRate (نسبة الإتمام)
  4. activityScore (النشاط)
```

---

## 🌍 دعم دول الخليج

```ts
import { gccCurrencies } from '@/services/butcherData';

const currency = gccCurrencies[butcher.country];
// { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal', nameAr: 'ريال سعودي' }
```

العملات المدعومة: SAR · AED · KWD · QAR · BHD · OMR

---

## ✅ ملاحظات التكامل

- `Country` مستوردة من `@/services/mockData` — لا تعارض
- جميع الشاشات تستخدم `colors` و `typography` من `@/constants/theme`
- `_layout.tsx` يضبط Stack navigator بدون header
- `story-viewer.tsx` يستخدم `transparentModal` presentation
- البيانات التجريبية في `butcherData.ts` — استبدلها بـ API calls في الإنتاج
