# إشعارات iOS وأمان لوحة الإدارة

## 1) إشعارات iOS

**المشكلة السابقة:** على iOS كان التطبيق يسجّل `getDevicePushTokenAsync()`، وهذا يعطي توكن APNs خام. والسيرفر يرسل عبر `firebase-admin` (FCM) فيرفضه، فلا تصل إشعارات iOS.

**الحل (أقل تغيير، بدون مكتبات جديدة):**

| المنصة | التوكن المسجّل | الإرسال من السيرفر |
|---|---|---|
| Android | FCM (`getDevicePushTokenAsync`)، بدون تغيير | `firebase-admin` كما هو |
| iOS | Expo push token (`getExpoPushTokenAsync`) بصيغة `ExponentPushToken[...]` | Expo Push API (`https://exp.host/--/api/v2/push/send`)، وهي توصلها عبر APNs |

- `backend-nest/src/queue/lib/push-transport.ts` يحدد الطريق من شكل التوكن: `ExponentPushToken[...]` يروح لـ Expo، وتوكن APNs الخام (64 حرف hex من النسخ القديمة) يُحذف لأنه ما يوصل بأي طريق، والباقي يروح لـ FCM.
- `DeviceNotRegistered` من Expo أو `registration-token-not-registered` / `invalid-registration-token` من FCM تحذف التوكن تلقائياً.
- التطبيق صار يحفظ التوكن بمفاتيح جديدة (`safat_push_token_v2`)، فأي نسخة قديمة كانت حافظة توكن APNs تسجّل توكن جديد تلقائياً بعد التحديث.

**المطلوب منك (مرة وحدة):**
1. **مفتاح APNs في EAS** (وليس في Firebase): أول `eas build -p ios` يسألك «Generate a new Apple Push Notifications service key?»، فاختر **Yes** وسجّل الدخول بحساب Apple Developer، وEAS ينشئه ويحفظه. أو ارفع مفتاح `.p8` موجود من `eas credentials` ← iOS ← Push Notifications.
2. **تفعيل Push Notifications** للـ App ID `com.sarh.app` في Apple Developer (EAS يسويها تلقائياً عادةً).
3. **اختياري:** إذا فعّلت «Enhanced push security» في expo.dev، ضع `EXPO_ACCESS_TOKEN` في `/opt/sarh/.env.app`. بدونها يشتغل الإرسال عادي.
4. **اختبار:** على آيفون حقيقي من TestFlight، سجّل دخول واسمح بالإشعارات، وأرسل رسالة من حساب ثاني.

> `GoogleService-Info.plist` موجود أصلاً في `app/` (مشروع `alsafat-d5f63`، bundle `com.sarh.app`). ما يحتاج تغيير لأن iOS ما عاد يمر على FCM.
> لو حبيت لاحقاً تخلي iOS على FCM مثل أندرويد، لازم مكتبة `@react-native-firebase/messaging` ومفتاح APNs مرفوع في Firebase Console ← Cloud Messaging. هذا ما سويناه، لأنه يضيف مكتبة native جديدة.

## 2) أمان لوحة الإدارة

- **كوكي HttpOnly:** السيرفر يضع `admin_token` (Path=/، مدته نفس مدة الـ access token) و`admin_refresh` (Path=/api/admin/auth، 12 ساعة متجددة)، وكلها `HttpOnly; Secure; SameSite=Strict`. والتوكن ما يوصل لـ JavaScript ولا ينحفظ في localStorage.
- الكوكي تُقبل فقط إذا ما فيه `Authorization: Bearer`، ومع ترويسة `X-Requested-With: sarh-admin`، ولأدوار ADMIN وMODERATOR فقط. ودخول التطبيق (Bearer) ما تغيّر.
- اللوحة تجدد الجلسة تلقائياً كل 10 دقائق، ومع أي 401 تجددها مرة وتعيد الطلب. وزر الخروج صار يلغي الجلسة من السيرفر.
- Socket الدعم يتوثّق بنفس الكوكي، من Origin مسموح فقط.
- **قفل الحساب:** 5 محاولات خاطئة (كلمة مرور أو رمز) خلال 15 دقيقة تقفل الحساب لنهاية المدة، وهذا فوق حد الـ IP الموجود.
- **التحقق بخطوتين (TOTP) اختياري لكل مشرف:** من اللوحة ← «الأمان والتحقق بخطوتين». يشتغل مع Google Authenticator وMicrosoft Authenticator و1Password. ولو فقد مشرف جواله، يقدر أي ADMIN يعيد ضبطه عبر `POST /api/admin/auth/2fa/reset/:userId`. ولو ما فيه ADMIN ثاني: `DELETE FROM "AdminTwoFactor" WHERE "userId"='...';`.
- **Migration:** `20261009180000_admin_two_factor` تنشئ جدول `AdminTwoFactor` (إضافة فقط). قبل تطبيقها يبقى الدخول شغال بدون 2FA.
- **اختياري:** `ADMIN_TOTP_ENC_KEY` (`openssl rand -hex 32`) لتشفير أسرار 2FA. بدونه يُشتق المفتاح من `JWT_SECRET`، يعني لو غيّرت `JWT_SECRET` لازم كل مشرف يعيد إعداد 2FA.
