# Sarh — System Architecture

آخر تحديث للتوثيق: **2026-09-23** (Phase 1 audit + Phase 2 docs).  
إن تعارض النص مع الكود، **الثقة للكود**.  
وجود مكوّن هنا يعني **Implemented** في المستودع، لا **Production Verified**.

---

## 1. المنتج

سرح (Sarh) سوق مواشٍ ومحتوى اجتماعي في السعودية، مع طبقة ملاحم، اشتراكات، بث مباشر، وإدارة.

هوية التطبيق الظاهرة: اسم العرض `Sarh`، الحزمة `com.sarh.app`، النطاق `sarhsa.online`.  
أسماء npm/Expo الداخلية `safat` / `safat-backend-nest` بقايا توافق — انظر قسم Legacy.

---

## 2. العملاء (أربعة، ليس ثلاثة)

| عميل | المسار | المكدس المؤكد في Phase 1 | منفذ التطوير |
|------|--------|--------------------------|--------------|
| تطبيق الجوال | `app/` | Expo **54.0.37** · React Native **0.81.5** · Expo Router | Expo |
| لوحة الإدارة | `admin-panel/` | Next.js **16.3.6** | `3000` (`/admin` في الإنتاج) |
| لوحة الملحمة | `butcher-dashboard/` | Next.js **16.3.6** | `3003` (`/butcher` في الإنتاج) |
| واجهة HTTP | `backend-nest/` | NestJS **12.0.4** | `3001` |

---

## 3. عمليات الخلفية

| العملية | المدخل | المنفذ | الدور |
|---------|--------|--------|--------|
| HTTP API | `backend-nest/src/main.ts` | `3001` | REST تحت البادئة `/api` |
| Socket.IO | `backend-nest/src/gateway/socket.main.ts` | `3002` | دردشة، بث، طلبات |
| Worker | `backend-nest/src/queue/worker.main.ts` | — | BullMQ + cron |

بادئة API العامة: `/api` (`main.ts`). مسارات بلا بادئة: `GET /payment/result`، `GET /payment/cancel`، `GET /privacy`، `GET /join`، `GET /join/success`.  
التوافق: الطلبات إلى `/api/v1/*` تُعاد كتابتها إلى `/api/*`.

---

## 4. مخازن البيانات والخدمات

| المكوّن | الاستخدام في الكود / الـ compose |
|---------|----------------------------------|
| PostgreSQL | Prisma (`backend-nest/prisma/`). صورة الإنتاج: `postgres:18-alpine`. CI: Postgres 16 واسم قاعدة `sarouh_test`. Compose المحلي: قاعدة `sarouh`. |
| Redis | كاش، حدود معدّل، جلسات/قائمة سوداء، محوّل Socket، طوابير BullMQ. صورة الإنتاج: `redis:7-alpine` مع `maxmemory 256mb` و`noeviction`. |
| BullMQ | وظائف في عملية worker |
| Cloudinary | التخزين السحابي عندما `STORAGE_PROVIDER=cloudinary`. المجلد الافتراضي في الكود: `safat` (توافق). الإنتاج يرفض `STORAGE_PROVIDER=local`. |
| S3 | مسار بديل إن `STORAGE_PROVIDER=s3` |
| `/uploads` | خدمة ملفات محلية اختيارية على الـ API |
| N-Genius (Network International) | دفع مستضاف — لا تمر بطاقات عبر تطبيق سرح |
| Nginx | وكيل عكسي في `nginx/` و`docker-compose.prod.yml` |
| Docker | `docker-compose.prod.yml` + `docker-compose.prod.ssl.yml` للإنتاج |

Redis منطقيًا مقسوم في الكود عبر قواعد/مفاتيح متعددة (كاش، طوابير، جلسات، محوّل socket). لم يُتحقق تشغيل Redis الحي في Phase 1.

---

## 5. مخطط التشغيل الموثَّق في المستودع

```
Internet
  → nginx :80 / :443
      → api:3001     /api  /uploads
      → socket:3002  /socket.io
      → admin:3000   /admin
      → butcher:3003 /butcher
api / worker / socket → postgres + redis (شبكة sarh_internal)
```

فحوصات الصحة **المعرَّفة في الكود والـ compose** (لم تُستدعَ على النطاق الحي في Phase 1):

- API: `GET /api/health` و`GET /api/health/ready`
- Socket: `GET /health` على منفذ الـ socket (بدون بادئة `/api`)
- Nginx يوثَّق في README كـ `GET /health` → API

---

## 6. إصدارات مؤكدة (Phase 1 `npm ci`)

| الحزمة | الإصدار |
|--------|---------|
| Node (آلة التدقيق) | v22.14.0 |
| npm | 10.9.7 |
| NestJS `@nestjs/core` | 12.0.4 |
| Prisma CLI | 5.22.0 |
| Expo | 54.0.37 |
| React Native | 0.81.5 |
| Next.js (admin + butcher) | 16.3.6 |
| React (admin) | 18.3.1 |

---

## 7. المصادقة والأدوار (Implemented)

- JWT + refresh في `backend-nest/src/auth/`
- حراس عامة: `JwtAuthGuard` و`RolesGuard`
- أدوار Prisma: `USER` · `BUTCHER` · `ADMIN` · `MODERATOR`
- CORS: قائمة بيضاء (`cors-origins.ts`)؛ أصول الإنتاج الافتراضية `https://sarhsa.online` و`https://www.sarhsa.online`

لم يُختبر مسار تسجيل دخول حي في Phase 1.

---

## 8. Legacy / Historical

الوثائق المؤرخة **2026-07-07** (`docs/SAFAT_PLATFORM_COMPLETE.md`، ونسخة قديمة من هذا الملف) وصفت المنصة باسم SAFAT ومسار `SAFAT_APP_fixed`، و**ثلاثة** عملاء فقط، وNext.js 14، وتخزينًا أساسيًا local/S3.

ذلك **لا يطابق** المستودع الحالي. اترك تلك الملفات للأرشيف. لا تحذف مفاتيح التوافق (`safat_*`، `sarouh:*`، مجلد Cloudinary `safat`).

ملفات `railway.json` و`render.yaml` و`Dockerfile` الجذري معلَّقة لمسارات نشر سابقة. الإنتاج الموثَّق في README هو Hostinger.
