# إعداد المشتريات داخل التطبيق (Apple IAP / Google Play Billing) — صرح

> هذا الدليل لصاحب الحساب. الكود جاهز في المستودع، لكن البيع داخل التطبيق لن يعمل
> حتى تُنفَّذ الخطوات أدناه في App Store Connect وGoogle Play Console، وتُضاف قيم البيئة
> على الخادم، ويُطبَّق ترحيل قاعدة البيانات.

## 0) ما الذي تغيّر وما الذي لم يتغيّر

| الخدمة | في تطبيق iOS / Android | في الموقع (sarhsa.online) |
|---|---|---|
| اشتراكات التوثيق (أزرق، أزرق+، ذهبي) | Apple IAP / Google Play (اشتراك يتجدد تلقائياً) | N-Genius (تجديد يدوي، بدون تغيير) |
| تمييز / تثبيت / تمييز+تثبيت / ترويج الإعلان | Apple IAP / Google Play (شراء لمرة واحدة) | N-Genius (بدون تغيير) |
| العمولة ورسوم الإعلانات | N-Genius (خدمة غير رقمية — بدون تغيير) | N-Genius |

- المكتبة: **expo-iap 5.8.3** (مجانية، رخصة MIT، من نفس مطوّر react-native-iap ونفس واجهة OpenIAP).
  اخترناها بدل react-native-iap لأن الإصدار الحالي من react-native-iap (v16 / Nitro) لا يدعم
  Expo config plugin ولا Expo dev client. لا RevenueCat ولا أي خدمة مدفوعة.
- مفتاح الطوارئ: `EXPO_PUBLIC_STORE_DIGITAL_PURCHASES` في `app/eas.json` قيمته `"true"`.
  لو احتجت إيقاف البيع الرقمي في التطبيق فوراً (مثلاً رفض مراجعة)، اجعلها `"false"` وأعد البناء:
  تختفي أزرار الشراء الرقمية في التطبيق ويبقى الموقع كما هو.
- التطبيق لا يحتوي أي رابط أو زر يوجّه لشراء الخدمات الرقمية خارج المتجر.

## 1) معرّفات المنتجات (انسخها حرفياً)

السعر المرجعي بالريال هو سعر الموقع. في المتجر اختر أقرب نقطة سعر متاحة (مثلاً 29.99 ر.س)
— التطبيق يعرض دائماً السعر الذي يرجعه المتجر بعملة المستخدم.

### الاشتراكات (Auto-Renewable — مجموعة واحدة: **Sarh Verification**)

| Product ID | الاسم | المدة | السعر المرجعي |
|---|---|---|---|
| `sa.sarh.verification.blue.monthly` | توثيق أزرق | شهر | 29 ر.س |
| `sa.sarh.verification.blueplus.monthly` | توثيق أزرق+ | شهر | 59 ر.س |
| `sa.sarh.gold.monthly` | التوثيق الذهبي | شهر | 99 ر.س |

ترتيب المستويات داخل المجموعة (Apple): الذهبي = المستوى 1 (الأعلى)، أزرق+ = 2، أزرق = 3.
في Google Play: لكل اشتراك **Base plan** واحد معرّفه `monthly` (تجديد تلقائي، شهري).

### منتجات الشراء لمرة واحدة (Consumable)

| Product ID | الخدمة | المدة | السعر المرجعي |
|---|---|---|---|
| `sa.sarh.boost.featured.1d` | تمييز الإعلان | يوم | 9 ر.س |
| `sa.sarh.boost.featured.3d` | تمييز الإعلان | 3 أيام | 25 ر.س |
| `sa.sarh.boost.pinned.1d` | تثبيت الإعلان | يوم | 12 ر.س |
| `sa.sarh.boost.pinned.3d` | تثبيت الإعلان | 3 أيام | 29 ر.س |
| `sa.sarh.boost.both.1d` | تمييز + تثبيت | يوم | 21 ر.س |
| `sa.sarh.boost.both.3d` | تمييز + تثبيت | 3 أيام | 54 ر.س |
| `sa.sarh.boost.promote.1d` | ترويج الإعلان | يوم | 19 ر.س |
| `sa.sarh.boost.promote.2d` | ترويج الإعلان | يومان | 35 ر.س |

المصدر الوحيد لهذه القائمة في الكود: `backend-nest/src/store-purchases/store-products.ts`
(ونسخة مطابقة في `app/lib/storeProducts.ts` يتحقق اختبار من تطابقها).

## 2) Apple — App Store Connect

1. **اتفاقية التطبيقات المدفوعة**: Business → Agreements → وقّع **Paid Applications Agreement**.
2. **البنك والضرائب**: في نفس الصفحة أكمل Bank Account وTax Forms (نموذج W-8BEN للأفراد/الشركات خارج أمريكا)
   حتى تصبح حالة الاتفاقية **Active**. بدونها لا تظهر المنتجات في التطبيق.
3. **برنامج الأعمال الصغيرة (عمولة 15%)**: قدّم من
   https://developer.apple.com/app-store/small-business-program/ (يُقبل غالباً خلال أيام).
4. **الاشتراكات**: Apps → صرح → Monetization → **Subscriptions** → Create subscription group
   باسم `Sarh Verification`، ثم أضف الاشتراكات الثلاثة بالمعرّفات أعلاه، المدة **1 Month**،
   السعر، الاسم والوصف بالعربية (Localization: Arabic)، وصورة مراجعة (Review screenshot).
   أضف Localization للمجموعة نفسها.
5. **المنتجات لمرة واحدة**: Monetization → **In-App Purchases** → Create → النوع **Consumable**
   لكل معرّف من الجدول الثاني، مع السعر والاسم والوصف وصورة المراجعة.
6. **مفتاح App Store Server API**: Users and Access → Integrations → **In-App Purchase** →
   Generate key. نزّل ملف `SubscriptionKey_XXXXXXXX.p8` (يُنزَّل مرة واحدة فقط)، وسجّل
   **Key ID** و**Issuer ID** الظاهر أعلى الصفحة.
7. **Apple ID للتطبيق**: App Information → General → **Apple ID** (رقم) — اختياري لكن مستحسن.
8. **إشعارات الخادم V2**: App Information → **App Store Server Notifications**:
   - Production Server URL: `https://sarhsa.online/api/store-purchases/apple/notifications`
   - Sandbox Server URL: نفس الرابط.
   - Version: **Version 2**.
   ثم اضغط «Request a Test Notification» بعد النشر للتأكد (يُسجَّل كـ TEST).
9. **مختبرو Sandbox**: Users and Access → Sandbox → **Test Accounts** → أنشئ بريداً غير مستخدم
   في Apple ID. على iPhone: الإعدادات → App Store → Sandbox Account.
10. **أول تقديم للمراجعة**: أضف المنتجات والاشتراكات إلى نسخة التطبيق في قسم
    «In-App Purchases and Subscriptions» قبل الإرسال (المنتجات الأولى تُراجع مع التطبيق).
    في ملاحظات المراجعة: «الخدمات الرقمية تُباع عبر IAP؛ العمولة ورسوم الإعلانات مقابل
    خدمات تتم خارج التطبيق». أضف رابطي الشروط والخصوصية في وصف التطبيق/حقل EULA.

## 3) Google — Play Console

1. **حساب التاجر**: Setup → **Payments profile** → أنشئ ملف الدفع (Merchant) وأضف الحساب البنكي.
2. **عمولة 15%**: الاشتراكات 15% تلقائياً؛ للمنتجات لمرة واحدة سجّل في برنامج الـ 15% لأول مليون دولار
   (Setup → **Account groups / 15% service fee**).
3. **رفع نسخة تحتوي صلاحية الفوترة**: لا يمكن إنشاء المنتجات قبل رفع بناء فيه
   `com.android.vending.BILLING` إلى أي مسار (Internal testing يكفي).
4. **الاشتراكات**: Monetize → Products → **Subscriptions** → Create لكل معرّف من الجدول الأول،
   ثم أضف **Base plan** معرّفه `monthly`، Auto-renewing، Billing period = 1 month، السعر، ثم **Activate**.
5. **المنتجات لمرة واحدة**: Monetize → Products → **In-app products** (One-time products) → Create
   لكل معرّف من الجدول الثاني، السعر، ثم **Activate**.
6. **حساب الخدمة (Service account)**:
   - في Google Cloud (نفس المشروع المرتبط بـ Play): فعّل **Google Play Android Developer API**.
   - IAM → Service Accounts → Create → أنشئ مفتاح **JSON** ونزّله.
   - Play Console → **Users and permissions** → Invite new users → بريد حساب الخدمة →
     صلاحيات التطبيق: **View financial data** و**Manage orders and subscriptions**.
     (قد يستغرق التفعيل حتى 24 ساعة.)
7. **الإشعارات الفورية RTDN (Pub/Sub)**:
   - Google Cloud → Pub/Sub → Create topic مثل `sarh-play-rtdn`.
   - في Permissions للموضوع أضف `google-play-developer-notifications@system.gserviceaccount.com`
     بدور **Pub/Sub Publisher**.
   - Create subscription → النوع **Push** → Endpoint:
     `https://sarhsa.online/api/store-purchases/google/rtdn`
     → فعّل **Enable authentication**، اختر حساب خدمة (يمكن نفس حساب الخدمة أعلاه)،
     وفي **Audience** اكتب قيمة ثابتة (مثلاً الرابط نفسه). هذه القيمة هي `GOOGLE_PLAY_RTDN_AUDIENCE`.
   - Play Console → Monetize → **Monetization setup** → Real-time developer notifications →
     Topic name: `projects/<PROJECT_ID>/topics/sarh-play-rtdn` → Send test notification.
8. **مختبرو التراخيص**: Settings → **License testing** → أضف بريد Gmail للمختبرين
   (الشراء بطرق دفع تجريبية بدون خصم حقيقي)، وأضفهم أيضاً لمسار Internal testing.

## 4) قيم البيئة على الخادم (`/opt/sarh/.env.app` أو ملف البيئة المستخدم)

| المتغير | القيمة |
|---|---|
| `APPLE_IAP_ISSUER_ID` | Issuer ID من الخطوة 2.6 |
| `APPLE_IAP_KEY_ID` | Key ID من الخطوة 2.6 |
| `APPLE_IAP_PRIVATE_KEY` | محتوى ملف ‎.p8 كسطر واحد مع `\n`، أو base64 للملف كاملاً |
| `APPLE_IAP_BUNDLE_ID` | `com.sarh.app` (الافتراضي) |
| `APPLE_IAP_APP_APPLE_ID` | رقم Apple ID للتطبيق (اختياري) |
| `GOOGLE_PLAY_PACKAGE_NAME` | `com.sarh.app` (الافتراضي) |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | ملف JSON لحساب الخدمة كسطر واحد، أو base64 له |
| `GOOGLE_PLAY_RTDN_AUDIENCE` | قيمة Audience في اشتراك Pub/Sub (إلزامية — بدونها تُرفض كل إشعارات Google) |
| `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT` | بريد حساب الخدمة المختار في اشتراك Push (مستحسن) |

- `scripts/hostinger/validate-env.sh` يعرض الآن قسم «IN-APP PURCHASES» (مضبوط/فارغ فقط، بدون القيم).
- الخادم يعمل بدونها (تحذير عند التشغيل فقط)، لكن `/api/store-purchases/verify` يرجع
  503 `store_not_configured` حتى تُضاف.
- لا ترسل هذه القيم في محادثة أو ترفعها للمستودع.

## 5) قاعدة البيانات

الترحيل: `backend-nest/prisma/migrations/20261009170000_store_purchases_iap`
(إضافي فقط: جدولان `StorePurchase` و`StoreNotification`، نوعان enum، وقيمتان جديدتان
`app_store` و`google_play` في `PaymentMethod`). **لم يُطبَّق على الإنتاج.** يُطبَّق مع النشر القادم
عبر `prisma migrate deploy` بعد أخذ نسخة احتياطية.

## 6) بناء التطبيق

- `app/android/` موجود في المستودع، لذلك لا يطبّق EAS إضافة expo-iap تلقائياً على Android؛
  أضفنا صلاحية BILLING يدوياً في `AndroidManifest.xml` والمكتبة تُربط تلقائياً (autolinking).
  إن أعدت توليد المجلد (`npx expo prebuild --platform android --clean`) فستُطبَّق الإضافة تلقائياً.
- iOS: لا يوجد مجلد `ios/` في المستودع، فيطبّق EAS الإضافة ويفعّل قدرة In-App Purchase.
  تأكد في developer.apple.com أن App ID `com.sarh.app` مفعّل عليه **In-App Purchase** (مفعّل افتراضياً).
- يلزم بناء جديد (`eas build`) — التحديث عبر OTA لا يكفي لأن المكتبة أصلية (native).

## 7) قائمة اختبار قبل الإطلاق

1. Sandbox (iOS) / License tester (Android): اشترِ «توثيق أزرق» → تظهر الشارة بعد تأكيد الخادم.
2. ترقية من أزرق إلى ذهبي داخل التطبيق (Android: استبدال مع احتساب نسبي؛ iOS: داخل نفس المجموعة).
3. «استعادة المشتريات» من صفحة التوثيق على جهاز آخر بنفس الحساب.
4. إلغاء التجديد من إعدادات المتجر → يصل إشعار → يُسجَّل إيقاف التجديد ويبقى التوثيق حتى نهاية المدة ثم ينتهي.
5. تمييز إعلان ليوم واحد → يظهر مميزاً فوراً.
6. استرداد (Refund) من Sandbox/Play Console → يُسحب الاشتراك.
7. الشراء المعلّق (Pending) في Android → رسالة «الدفع قيد المعالجة» ولا تفعيل حتى يكتمل الدفع.
8. الموقع: الدفع عبر N-Genius يعمل كما كان.
