# Phase 5 — Production/Staging QA (حي)

تاريخ التنفيذ: 2026-08-19 UTC  
البيئة المختبرة: إنتاج Render الحالي (`https://sarh-new4.onrender.com`, build `a19a3a2` = merge PR #102 على `main`)  
Staging منفصل: غير موجود (لا URL staging مستقل). Railway `https://sarh-app.up.railway.app` ما زال يرد كـ API قديم (Redis checks = false، build `5c3a442`).

لم يُغيَّر أي منطق، ولا React Native، ولا schema، ولا دورة الطلب/المخزون.

## ما نُفّذ حيًّا وما لم يُنفَّذ

| القدرة | الحالة |
|---|---|
| حسابا ملحمة A و B بكلمات مرور | غير متوفرين لهذا التشغيل — يوجد صفّان في PostgreSQL وفي `GET /admin/butchers` |
| لوحة `butcher-dashboard` منشورة | غير موجودة (DNS لـ `butchers.sarh.app` / `butcher.sarh.app` / `dashboard.sarh.app` لا يُحل) |
| PRs اللوحة 103–106 على `main` | كلها OPEN غير مدمجة — الإنتاج لا يحتوي `products/mine` ولا تجميع customers/reports الخاص باللوحة |

حساب `e2e_admin` (ADMIN، موجود في `.env.e2e.example`) نجح تسجيل دخوله على إنتاج Render. ليس مرتبطًا بملحمة. لم تُحفظ توكنات في git.

---

## جدول النتائج

PASS = نُفذ على البيئة المنشورة. NOT TESTED = تعذر التنفيذ الحي بالقيود أعلاه. FAIL = نُفذ وظهر عطل.

| الاختبار | النتيجة | الدليل |
|---|---|---|
| Login | PASS (جزئي) | `POST https://sarh-new4.onrender.com/api/auth/login` لحساب خاطئ → 401 `invalid_credentials` (~0.30s). حساب `e2e_admin` → 200 JWT role=ADMIN. دخول Butcher A و Butcher B: **NOT TESTED** (لا كلمات مرور ملاحم). |
| رفض USER غير المرتبط بملحمة | PASS (مكافئ ADMIN بلا ملحمة) | بعد JWT: `GET /api/butchers/me` → 404 `الملحمة غير موجودة`. `GET /api/butchers/stats` → 404 `لم يتم العثور على ملحمة مرتبطة بحسابك`. حساب USER عادي بكلمة مرور: **NOT TESTED**. |
| Tenant isolation | NOT TESTED | لا JWT لملحمة A و B. على الإنتاج الحالي `GET /butchers/customers` و `/reports` يُفسَّران كـ `GET /butchers/:id` (404 ملحمة) لأن Phase 4 غير منشور. `butcherId` مزيف مع JWT الأدمن على `/butchers/orders?page=1&butcherId=…` أعاد مصفوفة فارغة (طول 0) — لا يثبت عزل ملحمتين. منتجات عامة: `GET /butchers/products?butcherId=` لـ A و B أعاد 200 بأحجام جسم مختلفة (725 vs 2071 بايت) — كتالوج عام وليس عزل لوحة. |
| Orders | NOT TESTED | بدون JWT ملحمة. أدمن: `GET /api/butchers/orders` → 200 قائمة فارغة (0)، ~293–1013ms. تفاصيل طلب / تغيير حالة: **NOT TESTED** (لن تُحرَّك طلبات إنتاج حقيقية بدون حساب الملحمة). عقد الصفحات `{items,total}` غير موجود على هذا البناء. |
| Products | FAIL / NOT TESTED | `GET /api/butchers/products/mine` على الإنتاج → 404 `Cannot GET /api/butchers/products/mine` (Phase 3 غير منشور). تعديل منتج A ومنع الوصول لمنتج B من JWT A: **NOT TESTED**. |
| Inventory | NOT TESTED | صفحة المخزون تعتمد `products/mine` غير المنشور. دورة reserve/release/deduct على طلب حي: **NOT TESTED**. |
| Customers | FAIL (المنشور) | `GET /api/butchers/customers` → 404 `الملحمة غير موجودة` (مسار `:id` على `main`). تجميع العملاء للوحة **غير منشور**. |
| Reports | FAIL (المنشور) | `GET /api/butchers/reports` → 404 بنفس سبب `:id`. لا يمكن قياس زمن تقارير اللوحة على الإنتاج. |
| Settings | NOT TESTED | `PUT /api/butchers/:id` بدون توكن → 401. لم يُرسل `PUT` بجسم على ملحمة حقيقية حتى لا يُغيَّر الإنتاج. `PUT /butchers/me` من حساب ملحمة: **NOT TESTED**. |
| Socket | FAIL (جزئي) | `GET https://sarh-socket.onrender.com/health` → 200 `{"status":"ok","service":"socket"}` (~0.30s) HTTPS. اتصال Socket.IO: polling handshake أحيانًا 502 HTML من Render ثم نجح `polling` بعد ~12927ms (`id=TzOMahE2bhsEwvzFAAAB`). websocket-only فشل `websocket error`. أحداث طلب جديد / حالة / مخزون على لوحة مفتوحة، قطع/إعادة بدون تكرار، عزل أحداث B: **NOT TESTED**. |
| Notifications | PASS (جزئي) | `GET /api/notifications/unread-count` مع JWT الأدمن → 200 `{ unreadCount: 16 }` (~266–285ms). ظهور إشعار طلب حي على اللوحة: **NOT TESTED**. |
| Order lifecycle | NOT TESTED | لا طلب حي `pending→…→delivered`، لا انتقال غير قانوني، لا إلغاء، لا تحقق خصم مزدوج للمخزون على بيئة منشورة في هذا التشغيل. |
| Production infrastructure | FAIL | انظر القسم التالي. |

---

## البنية التحتية (حي)

| المكوّن | النتيجة | الدليل |
|---|---|---|
| Render API | PASS بعد الإيقاظ / FAIL على البرد | أول `GET /api/health` → **502** `x-render-routing: no-deploy` (Cloudflare+Render). بعد ذلك 200: `checks.db/redis_cache/redis_session/queue=true`، `version 1.1.1`، `build a19a3a2`، `uptime` كان 88s، `duration 3ms`، زمن HTTP ~0.80s. Redis: `connected_clients=16`، `blocked_clients=6`، `maxclients=50`، `maxmemory_policy=noeviction`. |
| Worker | PASS غير مباشر | `checks.queue=true` يعني BullMQ ردّ على نفس Redis. لا HTTP للـ worker (`sarh-worker` في `render.yaml`). لا لوحة Render في هذا التشغيل لإثبات أن العملية تعمل. |
| Redis | PASS | من health أعلاه + سياسة `noeviction`. |
| PostgreSQL | PASS | health `db=true`، واتصال قراءة مباشر: `Butcher` غير المحذوفة = **2**، `ButcherOrder` = **11**، زمن ~2.6s من هذه الشبكة. |
| Socket server | PASS/FAIL مختلط | `/health` 200. مسار Engine.IO تذبذب 502 ثم اتصال polling. |
| CORS | FAIL للوحة | OPTIONS من `https://sarh.app` و `https://www.sarh.app` → `access-control-allow-origin` مطابق. OPTIONS من `https://butchers.sarh.app` و `http://localhost:3003` → 204 **بدون** `Access-Control-Allow-Origin`. `BUTCHER_DASHBOARD_URL` غير ظاهر في الإنتاج. |
| Dashboard deployment | FAIL | لا نشر Next للوحة في CI (`.github/workflows/ci.yml` يبني `admin-panel` فقط). لا مضيف DNS للوحة. |
| Environment variables | PASS جزئي | API الحي يعمل بـ JWT/DB/Redis. متغيرات اللوحة `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SOCKET_URL` **غير قابلة للفحص** لعدم وجود نشر. |
| HTTPS | PASS للـ API/Socket | `https://sarh-new4.onrender.com` و `https://sarh-socket.onrender.com` على 443 عبر Cloudflare (`ssl_verify_result=0`). |
| الواجهة العامة www | FAIL | `https://www.sarh.app` و `https://sarh.app` → Cloudflare **522** (~19.5s). |
| Railway API | غير الإنتاج المعتمد للتطبيق | `/api/health` 200 لكن Redis/queue = false، commit مختلف، uptime ~7.5 أيام. |

---

## تعريف المبيعات (توثيق فقط — بلا توحيد)

لم يُغيَّر أي كود في Phase 5.

| السطح | التعريف الحالي في الكود (PRs 104/106، غير مدمج في الإنتاج) |
|---|---|
| `/dashboard/reports` و `GET /butchers/reports` | بيع مكتمل = `paymentStatus === 'paid'` و `status !== 'cancelled'`. غير المدفوع / الملغى / failed / refunded خارج المبيعات. المدفوع قيد التجهيز يُحتسب. |
| الرئيسية `GET /butchers/dashboard` و `GET /butchers/stats` | ما زالا أقرب إلى: طلبات الفترة **ما عدا الملغاة**، **بدون** شرط `paid` (`sumSalesSince` / فلتر `status !== cancelled`). |

لا توحيّد الآن حتى لا يتغير رقم الموبايل/`/butchers/stats`.

---

## الأداء (عيّنات حيّة بعد الإيقاظ)

| الطلب | الزمن التقريبي |
|---|---|
| `GET /api/health` (دافئ) | 276–800ms HTTP؛ داخل الخدمة 3ms |
| `GET /api/butchers/orders` | 293–1013ms (قائمة فارغة لأدمن بلا ملحمة) |
| `GET /api/notifications/unread-count` | ~266–285ms |
| `GET /api/butchers/products?butcherId=` | ~266–287ms |
| Pagination العملاء/التقارير على اللوحة | غير موجود على الإنتاج |
| Socket أول اتصال | 502 متكرر ثم ~13s polling |
| Reports SQL aggregation | ملاحظة مستقبلية فقط: عند دمج Phase 4، التجميع الحالي في الذاكرة لكل طلبات الفترة. 11 طلبًا في الإنتاج الآن؛ لا حاجة لإعادة البناء قبل وجود مشكلة حجم حقيقية |

---

## هل اللوحة جاهزة لاستبدال إدارة الملحمة في الجوال؟

**لا. جاهزية تقريبية: 20–30%.**

الموانع المتبقية:

1. PRs #103–#106 غير مدمجة — الإنتاج لا يشغّل APIs اللوحة (dashboard paged، products/mine، customers، reports).
2. لوحة Next غير منشورة ولا نطاق HTTPS لها، وCORS الإنتاج لا يسمح بأصل لوحة.
3. لم يُنفَّذ E2E بملحمتين A/B (عزل، دورة طلب كاملة، مخزون، realtime للطلبات) على البيئة المنشورة.
4. `www.sarh.app` يعطي 522؛ API يبرد إلى 502 `no-deploy`.
5. Socket.IO غير مستقر عند handshake (502) وwebsocket-only فشل من هذا العميل.
6. تعريف المبيعات مختلف بين التقارير والرئيسية/`stats` (موثّق، غير موحّد).
7. إدارة الملحمة في React Native ما زالت مطلوبة ويجب ألا تُحذف بعد Phase 5.

الخطوة التالية المقترحة (ليست جزءًا من هذا التشغيل): دمج PRs اللوحة → نشر اللوحة + `BUTCHER_DASHBOARD_URL` → حسابا ملحمة اختبار A/B على Staging أو إنتاج مخصّص → إعادة نفس جدول الاختبارات حتى يصبح كل صف PASS حقيقيًا.
