# Payments (Network International / N-Genius)

التحديث: 2026-09-23 — تصحيح فجوة Phase 1 مقابل `payments.dto.ts` والمتحكمات.  
**Implemented** في الكود. اختبارات الوحدة للدفع شُغّلت ضمن Backend Jest في Phase 1.  
**Live N-Genius وcheckout الإنتاج: غير مُختبرَين.**

التطبيق لا يرسل بيانات بطاقة إلى API سرح. الدفع على صفحة NI المستضافة.

---

## 1. الغرض

إنشاء صف `Payment` معلّق، الحصول على رابط checkout من NI، ثم الوفاء عند تأكيد NI (webhook أو مزامنة).

من يستخدمه (حسب الشاشات/المتحكمات الموجودة):

- مستخدمو التطبيق: اشتراك، رسوم إعلان، تعزيز/ترويج
- لوحة الملحمة: أنواع طلب/سلة في الـ DTO
- NI: webhook من خادم إلى خادم

---

## 2. مسارات HTTP الموجودة

| Method | Path | Auth | حد المعدّل |
|--------|------|------|-------------|
| POST | `/api/payments/initiate` | JWT | `payment` |
| POST | `/api/payments/:id/sync` | JWT | `payment` |
| POST | `/api/payments/:id/dev-complete` | JWT | `payment` — مرفوض ما لم يكن `NI_API_KEY` وهميًا (`isNiSandboxMockMode`) |
| POST | `/api/payments/webhook` | Public · جسم خام | توقيع `x-signature` أو `x-ni-signature` |
| POST | `/api/integrations/ni/webhook` | Public · نفس عائلة التحقق | توافق إعداد NI |
| GET | `/payment/result` | بلا بادئة `/api` | صفحة رجوع |
| GET | `/payment/cancel` | بلا بادئة `/api` | إلغاء |

`sync`: بعد العودة من checkout إذا تأخر الـ webhook — يسأل NI ويحدّث الحالة (`payments.controller.ts`).

---

## 3. `InitiatePaymentDto`

ملف: `backend-nest/src/payments/dto/payments.dto.ts`

| الحقل | إلزامي | ملاحظات |
|--------|--------|---------|
| `amount` | نعم | 0.01–100000 |
| `currency` | لا | |
| `method` | نعم | `mada` \| `visa` \| `mastercard` \| `apple_pay` \| `stc_pay` |
| `type` | نعم | انظر الأنواع |
| `referenceId` | لا في الـ DTO (UUID إن وُجد) | يُستخدم حسب النوع في الخدمة |
| `description` / `descriptionAr` | لا | ≤ 200 |
| `planId` | اشتراك | أحرف صغيرة وأرقام وشرطات |
| `billingCycle` | اشتراك | `monthly` \| `yearly` |
| `saleAmount` | رسوم إعلان (تعليق DTO) | 0.01–10_000_000 |

**أنواع `type` في الكود (أوسع من توثيق يوليو 2026):**

`subscription` · `fee` · `listing_fee` · `butcher_order` · `butcher_checkout` · `commission` · `order_commission`

---

## 4. مسار الخدمة (مختصر)

```
initiate → PaymentsService.initiate
  → تحقق المبلغ/المرجع
  → إنشاء أو إعادة استخدام Payment معلّق
  → طلب NI (أو وضع وهمي إذا المفتاح test_/فارغ)
  → checkoutUrl

webhook → verifySignature → NiWebhookService.handleRaw
  → IntegrationWebhookEvent (idempotent)
  → processSuccessfulPayment أو مسار refund/fail

sync → PaymentsService.syncPayment
  → استعلام NI → نفس الوفاء
```

وفاء ناجح (من الخدمة/المستودع) قد يحدّث اشتراكًا، `ListingFee`، أو `ListingBoost` (إشعارات التعزيز موجودة في `payments.service.ts`).  
الاسترداد: لا endpoint للمستخدم؛ حالة `refunded` من أحداث NI — انظر `docs/refunds.md` و`payments.repository.ts`.

---

## 5. نماذج مرتبطة

- `Payment` · `IntegrationOrder` · `IntegrationWebhookEvent` في `schema.prisma`
- `Local Payment.orderId` = مرجع التاجر؛ UUID الخاص بـ NI في `transactionId` / `externalOrderId` (تعليق المثال في `.env.example`)

---

## 6. الأمن (كود)

- JWT على initiate/sync/dev-complete
- HMAC على الـ webhook
- Idempotency عبر `IntegrationWebhookEvent`
- `validateProductionEnv()` يفرض `NI_BASE_URL`, `NI_OUTLET_ID`, `NI_API_KEY`, `NI_WEBHOOK_SECRET` في production
- `dev-complete` غير متاح بمفتاح إنتاج حقيقي

---

## 7. الواجهة

شاشات معروفة في التطبيق: `app/app/payment.tsx`، `app/app/fees.tsx`، تدفق التعزيز/الترويج تحت listings.  
طرق العرض: `mada`, `visa`, `mastercard`, `apple_pay`, `stc_pay`.  
حقول البطاقة في الواجهة إن وُجدت هي للعرض فقط — الإدخال على صفحة NI.

`GET /api/fees` موجود في `fees.controller.ts` (قائمة رسوم المستخدم) خلاف ملاحظة قديمة في نسخة 2026-07-07 من هذا الملف.

---

## 8. التحقق

| الحالة | |
|--------|--|
| Implemented | نعم |
| Unit tests (ضمن 879) | شُغّلت في Phase 1 |
| e2e / live NI | **NOT RUN** |
| Production Verified | **لا** |
