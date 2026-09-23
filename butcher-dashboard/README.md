# سرح — لوحة الملاحم (Butcher Dashboard)

لوحة ويب مستقلة لصاحب الملحمة داخل منصة Sarh. ليست POS وليست كاشير وليست لوحة إدارة المنصة وليست تطبيق الجوال.

```text
المتصفح (Vercel — butcher-dashboard / Next.js)
        │  /api/*  rewrite
        ▼
NestJS API (Render)  →  Prisma  →  PostgreSQL
        │
Socket.IO (Render sarh-socket)  ← اتصال المتصفح المباشر بـ NEXT_PUBLIC_SOCKET_URL
```

إدارة الملحمة في تطبيق React Native **تبقى** حتى تُنشر اللوحة وتُختبر على Production بحساب وطلب حقيقيين.

## الصفحات

- الرئيسية `/dashboard`
- الطلبات `/dashboard/orders` وتفاصيل الطلب
- المنتجات `/dashboard/products`
- المخزون `/dashboard/inventory` (عرض `availableQuantity` − `reservedQuantity` فقط)
- العملاء `/dashboard/customers`
- التقارير `/dashboard/reports`
- الإعدادات `/dashboard/settings`

Auth: `POST /api/auth/login` ثم `GET /api/butchers/me`. الملحمة تُحل من JWT `userId`. لا يُوثق `butcherId` من الواجهة.

## التشغيل المحلي

1. شغّل NestJS على المنفذ `3001` وSocket على `3002`.
2. `cd butcher-dashboard && cp .env.example .env.local && npm ci && npm run dev`
3. اللوحة على [http://localhost:3003](http://localhost:3003).

## متغيرات الواجهة (ليست أسرارًا)

| المتغير | الغرض |
|---------|--------|
| `NEXT_PUBLIC_API_URL` | أصل NestJS لإعادة كتابة `/api` من سيرفر Next |
| `NEXT_PUBLIC_SOCKET_URL` | أصل Socket.IO الحالي (إنتاج: `https://sarh-socket.onrender.com`) |

لا تضع JWT / DATABASE / REDIS داخل `NEXT_PUBLIC_*`.

## متغيرات Backend (CORS للـ Socket)

طلبات REST من اللوحة تمر عبر rewrite نفس الأصل، فلا تحتاج CORS للمتصفح. Socket يحتاج CORS.

| المتغير | الغرض |
|---------|--------|
| `BUTCHER_DASHBOARD_URL` | أصل https النهائي للوحة بعد أول نشر Vercel |
| `BUTCHER_DASHBOARD_VERCEL_HOSTS` | أسماء مضيف Vercel مفصولة بفاصلة |
| `BUTCHER_DASHBOARD_ALLOW_VERCEL` | `true` مؤقتًا للسماح بأي `*.vercel.app` حتى يُعرف الرابط |

لا يُفترض `alsfat.com` ولا يُربط `dashboard.sarh.app` في الكود. النطاق المخصص مرحلة لاحقة بطلب صريح.

## النشر على Vercel

1. مشروع Vercel جديد، **Root Directory** = `butcher-dashboard`.
2. Environment:
   - `NEXT_PUBLIC_API_URL=https://sarh-new4.onrender.com`
   - `NEXT_PUBLIC_SOCKET_URL=https://sarh-socket.onrender.com`
3. استخدم نطاق `*.vercel.app` الافتراضي أولًا.
4. بعد ظهور الرابط، على Render (`sarh-api` و `sarh-socket`):
   - `BUTCHER_DASHBOARD_URL=https://<المشروع>.vercel.app`
   - أو `BUTCHER_DASHBOARD_VERCEL_HOSTS=<المشروع>.vercel.app`
5. Backend يبقى على Render. لا تُنقل Nest إلى Vercel.

## حالة Production (حتى دمج هذا الفرع)

فحص 2026-08-19: `main` المنشور **لا** يحتوي مسارات اللوحة (`/butchers/dashboard` كملخص JWT، `products/mine`، `customers`، `reports`). انظر `docs/butcher-dashboard-phase5-qa.md`. لا تُعتبر اللوحة بديلًا للجوال قبل الدمج + النشر + اختبار ملحمة حقيقية.
