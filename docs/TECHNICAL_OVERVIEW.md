# Technical Overview

ملخص قصير للمستودع كما هو في 2026-09-23. التفاصيل في الملفات المجاورة.  
**Implemented** = موجود في الكود. **Tested** = شُغّل في Phase 1. **Production Verified** = لم يُثبت هنا إلا إذا ذُكر صراحة.

---

## Repository

```
sarh.app/
  app/                 Expo Router (جوال)
  backend-nest/        NestJS API + worker + socket + Prisma
  admin-panel/         Next.js إدارة
  butcher-dashboard/   Next.js ملحمة
  nginx/               إعدادات الوكيل
  scripts/hostinger/   نشر / SSL / نسخ احتياطي (موثَّق، غير مُعاد تشغيله)
  docker-compose.prod.yml
  docs/
```

---

## Frontend (`app/`)

- Expo Router + React Context (`AuthContext`, `AppContext`, …) — لا Redux ولا React Query في `app/package.json`.
- شاشات السوق، الخلاصة، الرسائل، الملف، الإعدادات، الدفع، القصص، البث.
- انتقالات المكدس الافتراضية: Fade + Scale عبر `screenLayout` و`FadeScaleAppear` (بدون انزلاق أفقي). لم تُختبر على جهاز Android في Phase 1.
- عارض وسائط (`MediaViewerModal` / `ImageViewerModal`) مع تكبير من موضع الصورة إن توفّر `origin`.
- هوية العرض Sarh؛ slug الحزمة الداخلي `safat`.

---

## Backend (`backend-nest/`)

ثلاث عمليات من نفس الصورة: API (`:3001`) · Socket (`:3002`) · Worker (BullMQ).  
Prisma على PostgreSQL. بادئة REST `/api`.

---

## Authentication / authorization

- تسجيل: كلمة مرور، OTP (Twilio في قوالب الإنتاج)، Google، refresh، logout.
- JWT عام على معظم المسارات؛ `@Public()` و`@OptionalAuth()` حسب المتحكم.
- `RolesGuard` يقرأ `Role` من JWT.
- `validateProductionEnv()` يوقف الإقلاع في `NODE_ENV=production` إن نقصت أسرار حرجة.

---

## Roles

`USER` · `BUTCHER` · `ADMIN` · `MODERATOR` (`schema.prisma`).

---

## Caching / queues / realtime

- Redis: كاش كيانات، rate limit، جلسات/قائمة سوداء، محوّل Socket.
- BullMQ في عملية worker: إشعارات وغيرها.
- Socket.IO للدردشة والبث والطلبات — **لم يُختبر حيًا** في Phase 1.

---

## Media

- رفع: `POST /api/upload/presign` و`POST /api/upload/direct`.
- الإنتاج المتوقَّع في القوالب: Cloudinary. المجلد الافتراضي في الكود `safat`.
- التطبيق: معرض منشورات + `FeedVideoTile` + عارض ملء الشاشة.

---

## Payments

Network International (N-Genius) checkout مستضاف. المسارات في الكود: initiate، webhook، sync، صفحات رجوع `/payment/result|cancel`.  
أنواع `InitiatePaymentDto`: اشتراك، رسوم إعلان، عمولة، طلب/سلة جزار.  
Boost/promotion لها متحكمات تحت `/api/listings`.  
التفاصيل: [`payments.md`](./payments.md). حي NI: **غير مُختبر**.

---

## Listings

إعلانات مواشٍ: قائمة، إنشاء، تعليقات، ترويج/تعزيز مدفوع، رسوم.  
النماذج في Prisma: `Listing`، `ListingFee`، `ListingBoost`، …

---

## Community / feed

منشورات نص/صور/فيديو، إعجاب، إعادة نشر، تعليقات، مشاهدة، إشارة مرجعية (`PostBookmark`).  
تفاعل متفائل في التطبيق (`usePostFeedActions` / `AppContext`).  
الاختبارات الوحدة للخلاصة شُغّلت في Phase 1. الحالة الإنتاجية للـ migration: **غير محققة**.

---

## Admin

`admin-panel` على `/admin`. API تحت `/api/admin/*` (مستخدمون، منشورات، إعلانات، بلاغات، جزارون، إعدادات، محتوى، دعم، …).

---

## Butcher dashboard

`butcher-dashboard` على `/butcher`. API تحت `/api/butchers/*` و`/api/butcher-applications/*` وتكامل Daftra في `/api/butchers/daftra` و`/api/admin/butchers/:id/daftra`.
