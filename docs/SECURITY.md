# Security

ضوابط **موجودة في الكود**. لا يعني ذلك أن النظام «آمن بالكامل» أو أن الإنتاج مُتحقق.

---

## Implemented

### JWT

- استراتيجية وحارس في `backend-nest/src/auth/`.
- `JwtAuthGuard` مسجَّل كـ `APP_GUARD`.
- أسرار الإنتاج: `JWT_SECRET` و`JWT_REFRESH_SECRET` بطول ≥ 32 في `validateProductionEnv()`.

### Roles

- `RolesGuard` عام؛ `@Roles(...)` على المتحكمات.
- تعداد Prisma: `USER` · `BUTCHER` · `ADMIN` · `MODERATOR`.

### CORS

- `isAllowedCorsOrigin` / `resolveCorsOrigins` في `backend-nest/src/lib/cors-origins.ts`.
- في production تُضاف `https://sarhsa.online` و`https://www.sarhsa.online`، وتُستبعد أصول localhost و`railway.app`.
- العملاء الأصليون بلا رأس `Origin` يُسمح لهم (`!origin`).

### Rate limiting

- `@RateLimit('api' | 'auth' | 'payment' | …)` عبر `rate-limiter-flexible`.
- مسارات الدفع تحمل `@RateLimit('payment')`.

### Production environment validation

- `validateProductionEnv()` قبل إقلاع API/worker/socket عندما `NODE_ENV=production`.
- يفشل إن نقصت: `DATABASE_URL`, JWT, Twilio Verify, `NI_*`, `APP_URL`, `CRON_SECRET`, Redis إن لم يُعطَّل، ومفاتيح Cloudinary أو S3 حسب `STORAGE_PROVIDER`.
- يرفض `DEV_OTP=true` و`STORAGE_PROVIDER=local` و`APP_URL` غير https أو على Railway/Render.

### DEV_OTP

- ممنوع في production عبر المدقق أعلاه (كود).

### N-Genius webhook

- `POST /api/payments/webhook` و`POST /api/integrations/ni/webhook` عامّان مع جسم خام.
- التحقق: `x-signature` أو `x-ni-signature` عبر `NiWebhookService.verifySignature` → `PaymentsService.verifyWebhookSignature`.
- التكرار: جدول `IntegrationWebhookEvent` (`@@unique([provider, eventKey])`).

### `dev-complete`

- `POST /api/payments/:id/dev-complete` يتطلب JWT ويُرفض ما لم يكن `NI_API_KEY` فارغًا أو `test_` أو `change-me` (`isNiSandboxMockMode()`).

### Storage

- الإنتاج: `cloudinary` أو `s3` فقط حسب المدقق.
- المجلد الافتراضي لـ Cloudinary في الكود: `safat`.

### `.env`

- `.gitignore` يستثني `.env` و`.env.*` ويبقي `!.env.example`.
- قوالب: `backend-nest/.env.example`، `scripts/hostinger/env.production.example`.

### رؤوس HTTP على الـ API

- في `main.ts`: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, وHSTS عندما الطلب https في production.

---

## Known Documentation / Configuration Gaps

لا تُحذف في هذه المرحلة:

| الفجوة | أين |
|--------|-----|
| إشارات مزوّدين قديمة (Supabase / Render / Railway) | `backend-nest/.env.example`، `render.yaml`، `railway.json` |
| `NI_OUTLET_ID` كقيمة UUID في ملف المثال | `backend-nest/.env.example` |
| مجلد Cloudinary الافتراضي `safat` | `backend-nest/src/shared/lib/storage.ts` |
| مفاتيح تخزين محلية `safat_*` و`sarouh:*` | تطبيق Expo (جلسات، خلاصة، إشارات) |
| ملفات نشر Railway/Render | جذر المستودع |
| اسم قاعدة CI `sarouh_test` | `.github/workflows/ci.yml` |

لم يُراجع تسريب أسرار حية في هذا التوثيق.
