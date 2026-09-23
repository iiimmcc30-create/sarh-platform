# سرح (Sarh)

سوق ومحتوى اجتماعي للمواشي والملاحم في السعودية.

هذا الملف يصف **المستودع الحالي** وحقائق بُنيت في تدقيق Phase 1 (2026-09-23). وجود كود لا يعني أن الميزة مُختبرة في الإنتاج.

## المكوّنات

| المسار | الدور | المكدس (مثبّت في `npm ci` أثناء Phase 1) |
|--------|--------|------------------------------------------|
| `app/` | تطبيق الجوال (Expo Router) | Expo **54.0.37** · React Native **0.81.5** |
| `backend-nest/` | HTTP API + worker + Socket.IO | NestJS **12.0.4** · Prisma **5.22.0** |
| `admin-panel/` | لوحة الإدارة | Next.js **16.3.6** |
| `butcher-dashboard/` | لوحة الملحمة (PWA) | Next.js **16.3.6** |

إنتاج التطبيق الموثَّق في المستودع: **Hostinger VPS** على **https://sarhsa.online**.  
`render.yaml` و`railway.json` ملفات تاريخية — README يمنع معاملتها كإنتاج حالي.

## البنية

```
Internet → nginx (:80/:443) → api:3001 (/api, /uploads)
                            → socket:3002 (/socket.io)
                            → admin:3000 (/admin)
                            → butcher:3003 (/butcher)
api / worker / socket → PostgreSQL + Redis (شبكة Docker داخلية)
التخزين السحابي الافتراضي في قوالب الإنتاج: Cloudinary
الدفع المستضاف: Network International (N-Genius)
```

أدوار الحاوية (`SERVICE_MODE` في `docker-compose.prod.yml`):

| خدمة | الوضع | العملية |
|------|--------|---------|
| api | `api` | HTTP + `prisma migrate deploy` عند الإقلاع (موثَّق في السكربتات، **لم يُنفَّذ** في Phase 1) |
| worker | `worker` | BullMQ + cron |
| socket | `socket` | Socket.IO |

## التطوير المحلي

يتطلب Node.js 22+ (Phase 1 شغّل **v22.14.0** و npm **10.9.7**).

```bash
cd backend-nest && cp .env.example .env   # املأ الأسرار محليًا
npm ci && npx prisma generate
npm run start:dev

cd app && npm ci && npx expo start
cd admin-panel && npm ci && npm run dev
cd butcher-dashboard && npm ci && npm run dev
```

Compose المحلي (`docker-compose.yml`) مخصّص للتطوير فقط. الإنتاج يستخدم `docker-compose.prod.yml` + `docker-compose.prod.ssl.yml`.

قوالب البيئة: `backend-nest/.env.example` و`scripts/hostinger/env.production.example`. لا تلتزم ملفات `.env`.

## الاختبار والبناء (ما تم تشغيله في Phase 1)

من تثبيت نظيف (`npm ci` من الـ lockfile في `/tmp`، وليس `node_modules` الموجودة):

| العمل | النتيجة |
|--------|---------|
| `backend-nest` `npm run build` | نجح |
| `app` `npm run typecheck` | نجح |
| `admin-panel` `npm run build` | نجح |
| `butcher-dashboard` typecheck + build | نجح |
| `npx prisma validate` | schema صالح |
| App Jest | 76 suite / 777 tests |
| Backend Jest | 121 suite / 879 tests |
| Admin Jest | 12 suite |
| Butcher Jest | 14 suite |

تفاصيل الاختبارات: [`docs/TESTING.md`](docs/TESTING.md).

**لم تُشغَّل في Phase 1:** e2e للـ backend، Playwright، EAS/Android، Docker الإنتاج، Socket.IO الحي، N-Genius الحي، `GET https://sarhsa.online/api/health`، backup/restore، أو تطبيق migrations على قاعدة.

## التوثيق

| ملف | الموضوع |
|-----|---------|
| [`docs/SYSTEM_ARCHITECTURE.md`](docs/SYSTEM_ARCHITECTURE.md) | المعمارية الحالية |
| [`docs/TECHNICAL_OVERVIEW.md`](docs/TECHNICAL_OVERVIEW.md) | نظرة تقنية قصيرة |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | نشر Hostinger (غير مُعاد التحقق حيًا) |
| [`docs/SECURITY.md`](docs/SECURITY.md) | ضوابط موجودة في الكود |
| [`docs/TESTING.md`](docs/TESTING.md) | نتائج Phase 1 |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Prisma / migrations |
| [`docs/API.md`](docs/API.md) | فهرس مسارات من الـ controllers |
| [`docs/payments.md`](docs/payments.md) | N-Genius |
| [`docs/posts.md`](docs/posts.md) | الخلاصة والتفاعل |
| [`docs/RELEASE_NOTES.md`](docs/RELEASE_NOTES.md) | ملاحظات الإصدار |

ملفات `docs/SAFAT_*.md` توثيق تاريخي من 2026-07-07. إن تعارضت مع الكود أو هذا README، **الثقة للكود**.

## التسمية القديمة

هوية المنتج: **سرح / Sarh** (`com.sarh.app`).  
أسماء الحزم `safat` / `safat-backend-nest` ومفاتيح التخزين `safat_*` و`sarouh:*` بقايا توافق — لا تُحذف في هذه المرحلة.

## الترخيص / التشغيل

النطاق الإنتاجي الموثَّق في المستودع: **https://sarhsa.online**  
الاستضافة الموثَّقة: Hostinger VPS + EAS (للبناء المحمول، غير مُشغَّل هنا) + Cloudinary + Twilio + Network International.
