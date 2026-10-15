# تدقيق إطلاق سرح (Sarh) — تقرير نهائي (تدقيق جاهزية)

- **تاريخ التدقيق النهائي:** 15 تشرين الأول / أكتوبر 2026
- **آخر تحديث إصلاحات:** 15 تشرين الأول / أكتوبر 2026 (مرحلة إصلاح F17 / F19 / F20 قبل تجهيز Google Play)
- **أساس المراجعة:** تدقيق جاهزية + إصلاحات كود محدودة + إعادة اختبار موجّه
- **الفرع:** `main` (`c9b621db` + تغييرات محلية غير مُلتزَم بها)
- **موقع الإنتاج (قراءة فقط):** https://sarhsa.online

**لم يُنفَّذ:** Commit، Push، PR، Deploy، Build (EAS)، migrations على الإنتاج، دفع حقيقي، أو طباعة أسرار.

---

## 1. الحكم النهائي

### **جاهز بشروط** — مع تقدّم ملموس نحو Google Play

الخدمة الحية تعمل. أُغلقت في الكود ثلاث عوائق كانت مفتوحة في التدقيق السابق: **F17** (webhook NI)، **F19** (حظر البث)، **F20** (ثغرات إنتاج لوحة الإدارة).

**يمكن الانتقال إلى تجهيز إصدار Google Play** (إعداد Console / مفاتيح / `.well-known` / بناء لاحق بموافقتك) بشرط أن تبقى البنود التالية مفتوحة خارج الكود:

1. **F01** — روابط `.well-known` ما زالت بقيم `REPLACE_WITH_…` على Git والإنتاج الحي.
2. **F02** — دورة N-Genius لم تُثبت في Sandbox.
3. **Google Play Billing إنتاجياً** — الكود جاهز؛ منتجات Play Console + `GOOGLE_PLAY_*` + RTDN غير مُثبتة هنا (وجود الوحدة ≠ تكامل مكتمل).
4. **نشر معلّق** — إصلاحات nginx/HSTS/`X-Powered-By` في الملفات فقط؛ الحي لم يتغيّر بعد.
5. **F04 / النسخ الاحتياطي** — تحقق تشغيلي على السيرفر.

---

## 2. ملخص إصلاحات هذه المرحلة

| البند | النتيجة | الدليل |
|---|---|---|
| **F17** | **مغلقة في الكود** | عند `payment_not_found`: `processWebhook` يعيد `503` + `terminal: false`؛ `NiWebhookService` لا يستدعي `markWebhookProcessed` ويُسجّل خطأ لإعادة المحاولة |
| **F19** | **مغلقة في الكود** | `handleLiveJoin` يستدعي `assertNotBlocked(viewer, host)` قبل زيادة المشاهدين |
| **F20** | **مغلقة (إنتاج admin)** | `next@16.3.8` · `axios@1.20.0` · `sharp@0.35.5` · `source-map-js@1.2.2` → `npm audit --omit=dev` = **0** |
| **Google Play Billing** | **مراجعة فقط — غير مكتمل إنتاجياً** | تحقق خادمي + Idempotency موجودة؛ لا منتجات/مفاتيح حيّة في هذا النطاق |

### اختبارات بعد الإصلاح

| المجموعة | النتيجة |
|---|---|
| `ni-webhook.service.spec` + `payments.service.spec` + `socket-gateway.service.spec` | **38 نجح / 0 فشل** |
| `admin-panel` Jest كامل | **77 نجح / 11 جناح** |
| `admin-panel` `npm audit --omit=dev` | **0 vulnerabilities** |
| `admin-panel` `npm audit` (مع dev) | 31 (22 moderate / 8 high / 1 critical) — سلسلة Jest/أدوات تطوير؛ لا تدخل `--omit=dev` |

---

## 3. فصل: ما تأكد بالكود vs ما يحتاج عملاً خارجياً

### تأكد بالكود

| المجال | الدليل |
|---|---|
| معرّف الحزمة Android/iOS | `com.sarh.app` في `app/app.json` |
| EAS production API | `https://sarhsa.online` في `eas.json` (بدون `developmentClient` في production) |
| NI: توقيع webhook إلزامي إنتاجاً | `verifyWebhookSignature` |
| NI: لا تفعيل من الحمولة وحدها | `verifyNiOrderBeforeFulfilment` |
| NI: لا تعليم processed عند دفعة مفقودة | `terminal: false` + `markWebhookError` (F17) |
| IAP: لا منح من طلب عميل غير موثوق | `POST /store-purchases/verify` بعد تحقق Apple/Google |
| IAP: منع تكرار المنح | `claim` + `already_granted` |
| بث: حظر المشاهد | `handleLiveJoin` + `MessagingPolicyService.assertNotBlocked` |
| Admin إنتاج نظيف من npm audit | انظر F20 أعلاه |

### يحتاج تدخلاً خارجياً / يدوياً

| المجال | السبب |
|---|---|
| F01 `.well-known` | قيم الاستبدال على الحي |
| F02 NI Sandbox | لا مفاتيح بيئة في جلسة التدقيق |
| Play Console منتجات + RTDN + service account | لم تُنشأ/تُضبط هنا |
| نشر nginx / API المحدَّث | موافقة صريحة ثم deploy |
| F04 Redis أحادي + نسخ احتياطي | SSH/تشغيل على السيرفر |
| بناء AAB / رفع Play | ممنوع في قواعد هذه المرحلة |

---

## 4. حالة المشكلات F01–F20

| رقم | الخطورة | الحالة | الدليل | متبقي |
|---|---|---|---|---|
| F01 | P1 | **مفتوحة** | Git + طلب حي لـ `REPLACE_WITH_…` | ملء Team ID + SHA256 ثم نشر |
| F02 | P1 | **تحتاج تحقق يدوي** | منطق NI قوي؛ بلا Sandbox هنا | جلسة NI Sandbox |
| F03 | P2 | **تحتاج تحقق يدوي** | مسار أحادي يشغّل migrations عند الإقلاع | ضبط `SKIP_MIGRATIONS` حسب الطوبولوجيا |
| F04 | P2 | **مفتوحة (ملف) / يدوي (سيرفر)** | Redis أحادي بلا `requirepass` | كلمة مرور أو تأكيد الشبكة |
| F05 | P2 | **مغلقة في الملفات / تحتاج نشر** | SSL overlay يربط redirect المفعّل | deploy nginx |
| F06 | P2 | **مغلقة في الملفات / تحتاج نشر** | HSTS في `nginx.ssl.server.conf` | deploy |
| F07 | P2 | **مغلقة (backend إنتاج)** | `backend-nest` `--omit=dev` = 0 | — |
| F08 | P2 | **مغلقة** | App Jest 1792 | — |
| F09 | P3 | **مغلقة في الكود / مفتوحة على الحي** | تعطيل Powered-By في الملفات | deploy |
| F10 | P3 | **مفتوحة** | `/api/health` يعرض إحصاءات Redis | قرار منتج |
| F11 | P3 | **مفتوحة** | وثائق جزارة راكدة | توثيق |
| F12 | P3 | **مفتوحة** | اختلاف CI/إنتاج Postgres | محاذاة لاحقة |
| F13 | P3 | **مفتوحة محلياً** | prettier CRLF Windows | CI Linux مرجع |
| F14 | P3 | **تحتاج تحقق يدوي** | مراجعة أول EAS production | عند البناء |
| F15 | P3 | **تحتاج تحقق يدوي** | مفاتيح عميل Firebase في Git | تقييد في Google Cloud |
| F16 | معلومات | **مغلقة** | الجزارة أُزيلت | — |
| **F17** | P2 | **مغلقة في الكود** | انظر القسم 5 | يحتاج deploy للإنتاج |
| **F18** | P2 | **مغلقة** | `google-services.json` → `com.sarh.app` فقط | مشروع Firebase باسم تاريخي (تجميلي) |
| **F19** | P3 | **مغلقة في الكود** | انظر القسم 5 | يحتاج deploy |
| **F20** | P2 | **مغلقة (إنتاج admin)** | `npm audit --omit=dev` = 0 بعد الترقية | ثغرات dev متبقية (أدناه) |

---

## 5. تفاصيل الإصلاحات

### F17 — N-Genius Webhook

**قبل:** `handleNIWebhook` يعيد بلا استثناء عند عدم وجود الدفعة → `processWebhook` = 200 → `markWebhookProcessed` → لا إعادة محاولة.

**بعد:**

| النتيجة | `outcome` | HTTP | `terminal` | تعليم الحدث |
|---|---|---|---|---|
| دفعة غير موجودة | `payment_not_found` | 503 | false | `markWebhookError` فقط |
| خطأ مؤقت / استثناء | `failed` | 500 | false | `markWebhookError` |
| نجاح تفعيل / فشل دفع مُعالَج | `processed` | 200 | true | `markWebhookProcessed` |
| مكرّر / already paid / noop معروف | `acknowledged` | 200 | true | `markWebhookProcessed` |
| JSON غير صالح | `invalid_json` | 400 | true | لا يُدرج حدثاً أصلاً (مسار مبكر) |

**ملفات:** `payments.service.ts` · `ni-webhook.service.ts` · اختبارات في `*.spec.ts`

**Idempotency:** لم تُمسّ مسارات التفعيل؛ المفتاح الفريد للحدث يبقى؛ التكرار بعد `processed=true` يُتجاهل بـ 200.

### F19 — البث المباشر

- `handleLiveJoin`: قبل زيادة المشاهدين، `assertNotBlocked(userId, hostId)` (نفس علاقة الحظر ثنائية الاتجاه المستخدمة في المراسلة).
- المضيف يدخل بدون فحص حظر.
- رسالة الخطأ: `لا يمكنك مشاهدة بث هذا المستخدم`.
- المجالس لم تُمس.

### F20 — لوحة الإدارة

| الحزمة | قبل (تقريبي) | بعد |
|---|---|---|
| next | 16.3.6 (نطاق advisory) | **16.3.8** |
| axios | ^1.18.1 | **1.20.0** |
| sharp (عبر next) | &lt;0.35.5 | **0.35.5** |
| source-map-js (عبر postcss) | 1.2.1 | **1.2.2** |

- `npm audit --omit=dev` → **0**
- `npm audit` كامل → 31 ثغرة في سلسلة Jest/babel (dev) — لم تُ强制 بـ `--force` لتجنّب كسر أدوات الاختبار
- Jest admin: **77 نجح**

### Google Play Billing (مراجعة — بلا تعديل تكاملي)

| القدرة في الكود | الحالة |
|---|---|
| كتالوج منتجات رقمية | موجود (`store-products.ts`) |
| تحقق من Google قبل المنح | موجود (`verifyGoogle` / Play API) |
| منع تكرار المنح | موجود (`claim`) |
| RTDN handler | موجود (`/store-purchases/google/rtdn`) |
| العميل لا يمنح محلياً | موجود (`iap.ts` → verify ثم finish) |
| منتجات Play Console | **غير مُثبتة في هذا النطاق** |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` / RTDN على السيرفر | **تحذير اختياري عند الإقلاع فقط — غير مُثبت حيّاً** |

**التصنيف:** اشتراكات/تعزيزات رقمية داخل التطبيق → Play Billing؛ سلع مادية/عمولات → N-Genius. لا تفعيل مزايا من طلب غير موثوق.

---

## 6. قائمة تحقق قبل تجهيز Google Play

### أُغلق بالكود (يحتاج نشر لاحقاً)

- [x] F17 webhook payment_not_found
- [x] F19 حظر البث
- [x] F20 ثغرات إنتاج admin

### مطلوب منك قبل/أثناء رفع Play

- [ ] F01: ملء ونشر `.well-known` (SHA256 توقيع Play)
- [ ] إنشاء منتجات الاشتراك/الـ consumables في Play Console (IDs من `store-products.ts`)
- [ ] ضبط `GOOGLE_PLAY_*` و`GOOGLE_PLAY_RTDN_*` على السيرفر (بدون لصق القيم في Git)
- [ ] ربط Pub/Sub → `POST /api/store-purchases/google/rtdn`
- [ ] اختبار داخلي (license testers) قبل الإنتاج
- [ ] F02: Sandbox NI إن بقي الدفع عبر الويب نشطاً
- [ ] موافقة على Deploy للكود الجديد + nginx
- [ ] موافقة صريحة على EAS Build / AAB (لم يُنفَّذ هنا)

---

## 7. الملفات المعدّلة في هذه المرحلة

| ملف | الغرض |
|---|---|
| `backend-nest/src/payments/payments.service.ts` | نتائج webhook طرفية/غير طرفية |
| `backend-nest/src/payments/payments.service.spec.ts` | اختبار payment_not_found |
| `backend-nest/src/integrations/services/ni-webhook.service.ts` | عدم تعليم processed عند retry |
| `backend-nest/src/integrations/services/ni-webhook.service.spec.ts` | اختبارات retry/terminal |
| `backend-nest/src/gateway/services/socket-gateway.service.ts` | فحص حظر live join |
| `backend-nest/src/gateway/services/socket-gateway.service.spec.ts` | اختبارات الحظر |
| `admin-panel/package.json` + `package-lock.json` | next/axios + transitive sharp/source-map-js |
| `docs/RELEASE_AUDIT_AR.md` | هذا التقرير |

---

## 8. المخاطر المتبقية (مرتبة)

1. **F01** — مانع روابط عميقة / سياسة Play للـ App Links.
2. **تكامل Play إنتاجي** — منتجات + مفاتيح + RTDN.
3. **F02** — إثبات NI Sandbox.
4. **نشر معلّق** — F17/F19/F05/F06/F09 لن تظهر على الحي قبل deploy.
5. **F04 / النسخ الاحتياطي** — تشغيل على السيرفر.

---

## 9. نتيجة Git

| البند | القيمة |
|---|---|
| Commit / Push / PR / Deploy / Build | **لم يُنفَّذ** |
| تغييرات جاهزة للمراجعة المحلية | الملفات في القسم 7 |

---

## ملحق — هل يمكن الانتقال لتجهيز Google Play؟

**نعم، كخطوة تحضير (Console + أصول المتجر + `.well-known` + مفاتيح خادم)**، لأن عوائق الكود الحرجة F17/F19/F20 أُغلقت واختُبرت.

**لا يعني ذلك أن التطبيق جاهز للرفع النهائي الآن:** يبقى F01، إعداد Play Billing الإنتاجي، وموافقتك على Build/Deploy.
