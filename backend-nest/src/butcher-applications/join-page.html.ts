const WAVE_BOTTOM =
  'M8.00 407.77C8.00 403.03 16.81 383.49 25.03 370.01C32.60 357.60 41.34 346.88 53.63 334.93C65.44 323.45 76.30 314.97 89.23 307.16C113.08 292.76 144.58 282.26 173.96 278.93L184.43 277.74L204.46 278.27L224.50 278.80L246.56 281.89C278.65 286.38 294.21 287.98 305.50 287.96C325.88 287.92 341.07 284.58 357.50 276.54L368.50 271.15L376.66 264.58C385.85 257.17 394.63 247.42 402.20 236.21C405.02 232.03 413.28 216.83 420.57 202.42C427.86 188.01 436.67 171.62 440.16 166.00C453.01 145.27 471.13 126.88 489.66 115.74C501.69 108.51 516.50 102.25 529.65 98.84L541.50 95.77L557.50 95.28L573.50 94.78L582.50 96.36C587.45 97.23 593.98 98.74 597.00 99.72L602.50 101.50L602.82 103.79C603.16 106.14 588.58 153.60 586.90 155.62C586.35 156.29 581.13 156.97 574.23 157.27C560.57 157.86 553.69 159.53 542.06 165.07C521.00 175.10 504.49 192.76 491.18 219.50C488.44 225.00 482.07 239.40 477.03 251.50C471.98 263.60 465.42 278.12 462.45 283.76C444.86 317.16 421.77 340.56 391.74 355.42C354.68 373.75 313.16 377.44 261.94 366.97C256.20 365.79 238.90 361.69 223.50 357.84C208.10 354.00 188.97 349.71 181.00 348.31L166.50 345.76L147.00 345.69L127.50 345.63L117.50 347.43C89.96 352.37 64.47 363.19 40.77 380.00C35.73 383.57 26.29 391.61 19.80 397.87C13.31 404.12 8.00 408.58 8.00 407.77Z';

const WAVE_TOP =
  'M33.55 307.50C35.70 297.55 43.05 280.11 50.23 267.91C77.23 222.04 117.96 193.95 170.50 184.97L182.50 182.92L212.00 182.00L241.50 181.09L248.48 179.55C264.36 176.04 275.70 170.72 285.04 162.39C292.36 155.85 295.53 152.24 300.73 144.50C306.08 136.54 307.48 133.66 316.96 111.03C325.59 90.45 329.44 82.90 337.37 71.00C346.89 56.73 365.15 40.89 381.50 32.72C389.99 28.48 403.62 24.11 413.71 22.39L423.34 20.75L435.92 21.31C442.84 21.61 451.88 22.61 456.00 23.52C465.53 25.61 474.50 29.14 474.50 30.78C474.50 31.48 471.04 33.56 466.82 35.39C449.62 42.87 438.31 50.63 424.44 64.46L414.38 74.50L407.11 85.42C398.34 98.59 391.91 111.81 381.04 139.00C371.28 163.41 362.11 182.54 354.90 193.50C351.91 198.05 344.87 206.24 338.57 212.50L327.49 223.50L318.57 228.74C307.36 235.34 296.14 239.70 284.15 242.11L274.81 244.00L260.40 244.00L245.99 244.00L221.24 240.81L196.50 237.61L178.00 237.62L159.50 237.63L147.68 239.87C132.74 242.71 119.02 247.42 102.50 255.39C80.26 266.13 61.56 280.10 42.85 299.94L32.90 310.50L33.55 307.50Z';

const DIAMOND =
  'M148.19 68.64C134.76 55.08 130.00 49.65 130.00 47.88C130.00 46.10 134.84 40.65 148.76 26.74C159.88 15.63 168.29 8.00 169.41 8.00C172.00 8.00 207.96 44.84 207.98 47.51C208.01 50.28 171.23 87.00 168.43 87.00C167.10 87.00 160.00 80.56 148.19 68.64Z';

export function escapeJoinHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeJoinHtml(title)} — سرح</title>
  <style>
    :root {
      --bg: #07131C;
      --surface: #0C1C27;
      --raised: #102633;
      --alt: #142C3A;
      --border: #1B3442;
      --text: #F4F7F9;
      --muted: #94A6B2;
      --dim: #657985;
      --action: #20B66F;
      --action-pressed: #18965B;
      --gold: #F5C56A;
      --danger: #E85D5D;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(900px 420px at 50% -10%, rgba(32,182,111,.18), transparent 60%),
        var(--bg);
      color: var(--text);
      font-family: "IBM Plex Sans Arabic", system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif;
    }
    .wrap { max-width: 720px; margin: 0 auto; padding: 36px 20px 64px; }
    .hero { text-align: center; margin-bottom: 28px; }
    .mark { width: 88px; height: 60px; margin: 0 auto 16px; display: block; }
    .kicker { color: var(--gold); letter-spacing: .12em; font-size: .78rem; margin: 0 0 8px; }
    h1 { font-size: 1.9rem; margin: 0 0 10px; }
    .lead { color: var(--muted); line-height: 1.7; margin: 0 auto; max-width: 34rem; }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 22px;
      margin-bottom: 16px;
    }
    h2 { font-size: 1.05rem; margin: 0 0 14px; }
    label { display: block; color: var(--dim); font-size: .82rem; margin: 12px 0 6px; }
    input {
      width: 100%;
      border: 1px solid var(--border);
      background: var(--raised);
      color: var(--text);
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 1rem;
    }
    textarea, select {
      width: 100%;
      border: 1px solid var(--border);
      background: var(--raised);
      color: var(--text);
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 1rem;
      font-family: inherit;
    }
    textarea { min-height: 88px; resize: vertical; }
    input:focus, textarea:focus, select:focus { outline: 2px solid rgba(32,182,111,.45); border-color: var(--action); }
    .hint { color: var(--dim); font-size: .78rem; margin: 4px 0 0; }
    .file {
      border: 1px dashed var(--border);
      background: var(--raised);
      border-radius: 12px;
      padding: 12px;
    }
    .file input { border: 0; padding: 0; background: transparent; }
    .fname { color: var(--action); font-size: .85rem; margin-top: 6px; }
    .map { height: 220px; border-radius: 14px; overflow: hidden; border: 1px solid var(--border); margin-top: 8px; }
    .steps { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
    .step {
      font-size: .72rem;
      color: var(--dim);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 4px 10px;
    }
    .phone { display: flex; flex-direction: row-reverse; gap: 8px; align-items: center; }
    .dial { color: var(--muted); padding: 0 6px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .btn, .btn-ghost {
      width: 100%;
      border: 0;
      border-radius: 14px;
      padding: 14px;
      font-weight: 700;
      font-size: 1rem;
      cursor: pointer;
    }
    .btn { background: var(--action); color: #fff; margin-top: 10px; }
    .btn:hover { background: var(--action-pressed); }
    .btn:disabled { opacity: .65; cursor: wait; }
    .btn-ghost {
      background: transparent;
      color: var(--action);
      border: 1px solid var(--action);
      margin-top: 8px;
    }
    .check { display: flex; flex-direction: row-reverse; gap: 10px; align-items: flex-start; color: var(--muted); line-height: 1.6; margin: 8px 0 16px; }
    .err { color: var(--danger); text-align: center; min-height: 1.4em; }
    .ok { color: var(--action); }
    .login { display: block; text-align: center; color: var(--gold); margin: 18px 0 8px; }
    .foot { text-align: center; color: var(--dim); font-size: .85rem; }
    .hidden { display: none; }
    .summary { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); color: var(--muted); }
    .summary b { color: var(--text); }
    @media (max-width: 640px) { .row { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main class="wrap">${body}</main>
</body>
</html>`;
}

const MARK = `<svg class="mark" viewBox="0 0 611 417" aria-hidden="true">
  <path fill="#F4F7F9" d="${WAVE_BOTTOM}"/>
  <path fill="#F4F7F9" d="${WAVE_TOP}"/>
  <path fill="#F4F7F9" d="${DIAMOND}"/>
</svg>`;

export function renderButcherJoinPage(): string {
  const body = `
    <section class="hero">
      ${MARK}
      <p class="kicker">سرح للمنشآت</p>
      <h1>انضمام الملاحم</h1>
      <p class="lead">قدّم طلب انضمام رسمي إلى منصة سرح بنفس متطلبات نموذج الملاحم داخل التطبيق. يراجع الفريق الطلب ثم يجهّز حساب الإدارة الخاص بالملحمة.</p>
    </section>
    <div class="steps">
      <span class="step">1. الجوال</span>
      <span class="step">2. صاحب الطلب</span>
      <span class="step">3. الملحمة</span>
      <span class="step">4. الموقع</span>
      <span class="step">5. النشاط</span>
      <span class="step">6. المستندات</span>
      <span class="step">7. الإقرار</span>
    </div>
    <form id="join-form" novalidate>
      <section class="card">
        <h2>1. التحقق من الجوال</h2>
        <label for="phone">رقم الجوال</label>
        <div class="phone">
          <span class="dial">+966</span>
          <input id="phone" name="phone" inputmode="numeric" placeholder="5xxxxxxxx" maxlength="10" required />
        </div>
        <div id="otp-box" class="hidden">
          <label for="otp">رمز التحقق</label>
          <input id="otp" name="otp" inputmode="numeric" maxlength="6" placeholder="000000" />
          <button type="button" class="btn-ghost" id="verify-otp">تأكيد الرمز</button>
        </div>
        <button type="button" class="btn-ghost" id="send-otp">إرسال رمز التحقق</button>
        <p id="phone-ok" class="ok hidden">تم التحقق من الجوال</p>
      </section>
      <section class="card">
        <h2>2. بيانات صاحب الطلب</h2>
        <label for="displayName">الاسم</label>
        <input id="displayName" name="displayName" required />
        <label for="email">البريد الإلكتروني (اختياري)</label>
        <input id="email" name="email" type="email" dir="ltr" />
        <div id="new-user">
          <label for="username">اسم المستخدم</label>
          <input id="username" name="username" dir="ltr" placeholder="latin_username" />
          <p class="hint">مطلوب عند إنشاء حساب جديد. أحرف إنجليزية صغيرة وأرقام وشرطة سفلية.</p>
          <label for="password">كلمة المرور (اختياري)</label>
          <input id="password" name="password" type="password" />
        </div>
      </section>
      <section class="card">
        <h2>3. بيانات الملحمة</h2>
        <label for="nameAr">اسم الملحمة (عربي)</label>
        <input id="nameAr" name="nameAr" required />
        <label for="nameEn">اسم الملحمة (إنجليزي)</label>
        <input id="nameEn" name="nameEn" dir="ltr" required />
        <label for="shopPhone">هاتف المحل</label>
        <input id="shopPhone" name="shopPhone" inputmode="tel" />
        <label for="commercialReg">السجل التجاري</label>
        <input id="commercialReg" name="commercialReg" required />
        <label for="country">الدولة</label>
        <select id="country" name="country">
          <option value="SA" selected>السعودية</option>
        </select>
        <label for="cityAr">المدينة</label>
        <input id="cityAr" name="cityAr" required />
        <label for="city">المدينة (إنجليزي)</label>
        <input id="city" name="city" dir="ltr" required />
        <label for="addressAr">العنوان</label>
        <input id="addressAr" name="addressAr" placeholder="الحي، الشارع" required />
        <label for="address">العنوان (إنجليزي)</label>
        <input id="address" name="address" dir="ltr" required />
      </section>
      <section class="card">
        <h2>حساب الملحمة</h2>
        <p class="hint">هذه البيانات لحساب الملحمة عند قبول الطلب. حسابك الحالي يبقى كما هو.</p>
        <label for="accountUsername">اسم المستخدم</label>
        <input id="accountUsername" name="accountUsername" dir="ltr" placeholder="latin_username" required />
        <label for="accountEmail">البريد الإلكتروني (اختياري)</label>
        <input id="accountEmail" name="accountEmail" type="email" dir="ltr" />
        <label for="accountPassword">كلمة المرور</label>
        <input id="accountPassword" name="accountPassword" type="password" required />
        <label for="accountPasswordConfirm">تأكيد كلمة المرور</label>
        <input id="accountPasswordConfirm" name="accountPasswordConfirm" type="password" required />
      </section>
      <section class="card">
        <h2>4. بيانات الموقع</h2>
        <p class="hint">حدد موقع المحل على الخريطة. لا يمكن الإرسال بإحداثيات فارغة أو 0,0.</p>
        <div id="map" class="map" role="application" aria-label="خريطة موقع المحل"></div>
        <div class="row">
          <div>
            <label for="lat">خط العرض</label>
            <input id="lat" name="lat" dir="ltr" inputmode="decimal" required />
          </div>
          <div>
            <label for="lng">خط الطول</label>
            <input id="lng" name="lng" dir="ltr" inputmode="decimal" required />
          </div>
        </div>
      </section>
      <section class="card">
        <h2>5. النشاط وأوقات العمل</h2>
        <label for="bioAr">نبذة عربية (اختياري)</label>
        <textarea id="bioAr" name="bioAr" maxlength="1000"></textarea>
        <label for="bioEn">نبذة إنجليزية (اختياري)</label>
        <textarea id="bioEn" name="bioEn" maxlength="1000" dir="ltr"></textarea>
        <label for="specialties">التخصصات (اختياري، مفصولة بفاصلة)</label>
        <input id="specialties" name="specialties" placeholder="لحم بقري، غنم" />
        <div class="row">
          <div>
            <label for="openTime">وقت الفتح</label>
            <input id="openTime" name="openTime" value="06:00" required />
          </div>
          <div>
            <label for="closeTime">وقت الإغلاق</label>
            <input id="closeTime" name="closeTime" value="22:00" required />
          </div>
        </div>
      </section>
      <section class="card">
        <h2>6. المستندات المطلوبة</h2>
        <p class="hint">المسموح: PDF أو JPG أو PNG أو WEBP. الحد 10 م.ب، وصورة المحل 15 م.ب.</p>
        <label for="commercial_license">السجل التجاري</label>
        <div class="file">
          <input id="commercial_license" name="commercial_license" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" required />
          <p class="fname" id="name-commercial_license"></p>
        </div>
        <label for="national_id">الهوية الوطنية</label>
        <div class="file">
          <input id="national_id" name="national_id" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" required />
          <p class="fname" id="name-national_id"></p>
        </div>
        <label for="municipal_permit">تصريح البلدية</label>
        <div class="file">
          <input id="municipal_permit" name="municipal_permit" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" required />
          <p class="fname" id="name-municipal_permit"></p>
        </div>
        <label for="shop_photo">صورة المحل</label>
        <div class="file">
          <input id="shop_photo" name="shop_photo" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" required />
          <p class="fname" id="name-shop_photo"></p>
        </div>
        <label for="other">مستند آخر (اختياري)</label>
        <div class="file">
          <input id="other" name="other" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" />
          <p class="fname" id="name-other"></p>
        </div>
        <p id="upload-status" class="hint"></p>
      </section>
      <section class="card">
        <h2>7. الإقرار والموافقة</h2>
        <label class="check">
          <input type="checkbox" id="acceptedTerms" />
          أوافق على الشروط ومراجعة الطلب من فريق سرح.
        </label>
        <label class="check">
          <input type="checkbox" id="confirmAccuracy" />
          أؤكد أن البيانات والمستندات صحيحة.
        </label>
      </section>
      <p class="err" id="error"></p>
      <button class="btn" type="submit" id="submit">إرسال طلب الانضمام</button>
    </form>
    <a class="login" href="https://sarhsa.online/butcher/login">لديك حساب ملحمة؟ تسجيل الدخول</a>
    <p class="foot">لن يتم إنشاء حساب دفترة في هذه المرحلة.</p>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      (function () {
        var token = '';
        var isNew = true;
        var picked = { lat: null, lng: null };
        var err = document.getElementById('error');
        var ALLOWED = { 'application/pdf': 1, 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1 };
        var REQUIRED_DOCS = ['commercial_license', 'national_id', 'municipal_permit', 'shop_photo'];
        var MAX_DOC = 10 * 1024 * 1024;
        var MAX_PHOTO = 15 * 1024 * 1024;
        function show(id, on) { document.getElementById(id).classList.toggle('hidden', !on); }
        function msg(t) { err.textContent = t || ''; }
        function fullPhone() {
          var d = document.getElementById('phone').value.replace(/\\D/g, '').replace(/^0/, '');
          return '+966' + d;
        }
        function envelope(json) {
          if (json && json.success && json.data && typeof json.data === 'object') return json.data;
          return json || {};
        }
        function maxFor(type) { return type === 'shop_photo' ? MAX_PHOTO : MAX_DOC; }
        function validateFile(type, file) {
          if (!file) return 'مستند مطلوب غير مرفوع';
          var mime = file.type || '';
          if (!ALLOWED[mime]) return 'نوع الملف غير مدعوم. المسموح: PDF، JPG، PNG، WEBP';
          if (file.size > maxFor(type)) return type === 'shop_photo' ? 'حجم الملف يتجاوز الحد المسموح (15 م.ب)' : 'حجم الملف يتجاوز الحد المسموح (10 م.ب)';
          return '';
        }
        REQUIRED_DOCS.concat(['other']).forEach(function (type) {
          var input = document.getElementById(type);
          input.addEventListener('change', function () {
            var file = input.files && input.files[0];
            var label = document.getElementById('name-' + type);
            if (!file) { label.textContent = ''; return; }
            var issue = validateFile(type, file);
            label.textContent = issue ? issue : file.name;
            label.style.color = issue ? '#E85D5D' : '#20B66F';
            if (issue) input.value = '';
          });
        });
        function initMap() {
          if (!window.L) return;
          var map = L.map('map').setView([24.7136, 46.6753], 11);
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
          var marker = null;
          function setPoint(lat, lng) {
            picked.lat = lat;
            picked.lng = lng;
            document.getElementById('lat').value = String(lat);
            document.getElementById('lng').value = String(lng);
            if (marker) marker.setLatLng([lat, lng]);
            else marker = L.marker([lat, lng]).addTo(map);
          }
          map.on('click', function (e) { setPoint(e.latlng.lat, e.latlng.lng); });
          function syncFromInputs() {
            var lat = Number(document.getElementById('lat').value);
            var lng = Number(document.getElementById('lng').value);
            if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return;
            setPoint(lat, lng);
            map.setView([lat, lng], 14);
          }
          document.getElementById('lat').addEventListener('change', syncFromInputs);
          document.getElementById('lng').addEventListener('change', syncFromInputs);
        }
        if (document.readyState === 'complete') initMap();
        else window.addEventListener('load', initMap);
        document.getElementById('send-otp').onclick = function () {
          msg('');
          fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: fullPhone(), channel: 'sms' })
          }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
            .then(function (x) {
              if (!x.r.ok) { msg(x.j.messageAr || x.j.message_ar || 'فشل إرسال رمز التحقق'); return; }
              show('otp-box', true);
            }).catch(function () { msg('تعذّر الاتصال بالخادم'); });
        };
        document.getElementById('verify-otp').onclick = function () {
          msg('');
          fetch('/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: fullPhone(), code: document.getElementById('otp').value, purpose: 'join' })
          }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
            .then(function (x) {
              if (!x.r.ok) { msg(x.j.messageAr || 'رمز التحقق غير صحيح'); return; }
              var data = envelope(x.j);
              token = String(data.phone_token || '');
              isNew = Boolean(data.is_new_user);
              if (!token) { msg('تعذّر التحقق من الجوال'); return; }
              show('phone-ok', true);
              show('new-user', isNew);
              if (!document.getElementById('shopPhone').value) document.getElementById('shopPhone').value = fullPhone();
            }).catch(function () { msg('تعذّر الاتصال بالخادم'); });
        };
        document.getElementById('join-form').onsubmit = function (e) {
          e.preventDefault();
          msg('');
          document.getElementById('upload-status').textContent = '';
          if (!token) { msg('تحقق من رقم الجوال أولاً'); return; }
          if (!document.getElementById('acceptedTerms').checked) { msg('يجب الموافقة على الشروط'); return; }
          if (!document.getElementById('confirmAccuracy').checked) { msg('يجب تأكيد صحة البيانات'); return; }
          var accountUsername = document.getElementById('accountUsername').value.trim().toLowerCase();
          var accountPassword = document.getElementById('accountPassword').value;
          var accountPasswordConfirm = document.getElementById('accountPasswordConfirm').value;
          if (!accountUsername) { msg('اسم مستخدم حساب الملحمة مطلوب'); return; }
          if (!accountPassword) { msg('كلمة المرور مطلوبة'); return; }
          if (!accountPasswordConfirm) { msg('تأكيد كلمة المرور مطلوب'); return; }
          if (accountPassword !== accountPasswordConfirm) { msg('تأكيد كلمة المرور غير مطابق'); return; }
          var lat = Number(document.getElementById('lat').value);
          var lng = Number(document.getElementById('lng').value);
          if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
            msg('يجب تحديد موقع المحل على الخريطة');
            return;
          }
          var i;
          for (i = 0; i < REQUIRED_DOCS.length; i++) {
            var type = REQUIRED_DOCS[i];
            var input = document.getElementById(type);
            var file = input.files && input.files[0];
            var issue = validateFile(type, file);
            if (issue) { msg(issue); return; }
          }
          var other = document.getElementById('other').files && document.getElementById('other').files[0];
          if (other) {
            var otherIssue = validateFile('other', other);
            if (otherIssue) { msg(otherIssue); return; }
          }
          var form = new FormData();
          form.append('phone', fullPhone());
          form.append('phone_token', token);
          form.append('displayName', document.getElementById('displayName').value.trim());
          form.append('arabicName', document.getElementById('displayName').value.trim());
          var email = document.getElementById('email').value.trim();
          if (email) form.append('email', email);
          if (isNew) form.append('username', document.getElementById('username').value.trim().toLowerCase());
          var password = document.getElementById('password').value;
          if (isNew && password) form.append('password', password);
          form.append('nameAr', document.getElementById('nameAr').value.trim());
          form.append('nameEn', document.getElementById('nameEn').value.trim());
          form.append('shopPhone', document.getElementById('shopPhone').value.trim() || fullPhone());
          form.append('commercialReg', document.getElementById('commercialReg').value.trim());
          form.append('country', document.getElementById('country').value || 'SA');
          form.append('city', document.getElementById('city').value.trim());
          form.append('cityAr', document.getElementById('cityAr').value.trim());
          form.append('address', document.getElementById('address').value.trim() || document.getElementById('addressAr').value.trim());
          form.append('addressAr', document.getElementById('addressAr').value.trim());
          form.append('lat', String(lat));
          form.append('lng', String(lng));
          var bioAr = document.getElementById('bioAr').value.trim();
          var bioEn = document.getElementById('bioEn').value.trim();
          if (bioAr) form.append('bioAr', bioAr);
          if (bioEn) form.append('bioEn', bioEn);
          var specialties = document.getElementById('specialties').value.trim();
          if (specialties) form.append('specialties', specialties);
          form.append('openTime', document.getElementById('openTime').value);
          form.append('closeTime', document.getElementById('closeTime').value);
          form.append('acceptedTerms', 'true');
          form.append('confirmAccuracy', 'true');
          form.append('accountUsername', accountUsername);
          var accountEmail = document.getElementById('accountEmail').value.trim();
          if (accountEmail) form.append('accountEmail', accountEmail.toLowerCase());
          form.append('accountPassword', accountPassword);
          form.append('accountPasswordConfirm', accountPasswordConfirm);
          REQUIRED_DOCS.forEach(function (type) {
            form.append(type, document.getElementById(type).files[0]);
          });
          if (other) form.append('other', other);
          document.getElementById('submit').disabled = true;
          document.getElementById('upload-status').textContent = 'جاري رفع المستندات وإرسال الطلب...';
          fetch('/api/butcher-applications/join', { method: 'POST', body: form })
            .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
            .then(function (x) {
              document.getElementById('submit').disabled = false;
              document.getElementById('upload-status').textContent = '';
              if (!x.r.ok) { msg(x.j.messageAr || x.j.message_ar || 'تعذّر إرسال الطلب'); return; }
              var data = envelope(x.j);
              var q = new URLSearchParams({
                n: String(data.applicationNumber || ''),
                name: String(data.nameAr || document.getElementById('nameAr').value.trim())
              });
              window.location.href = '/join/success?' + q.toString();
            }).catch(function () {
              document.getElementById('submit').disabled = false;
              document.getElementById('upload-status').textContent = '';
              msg('تعذّر الاتصال بالخادم');
            });
        };
      })();
    </script>
  `;
  return shell('انضمام الملاحم', body);
}

export function renderButcherJoinSuccessPage(input: {
  applicationNumber?: string;
  nameAr?: string;
}): string {
  const number = input.applicationNumber?.trim()
    ? `#${escapeJoinHtml(input.applicationNumber.trim())}`
    : '—';
  const name = input.nameAr?.trim()
    ? `<div class="summary"><span>الملحمة</span><b>${escapeJoinHtml(input.nameAr.trim())}</b></div>`
    : '';
  const body = `
    <section class="hero">
      ${MARK}
      <p class="kicker">سرح للمنشآت</p>
      <h1>تم استلام طلب الانضمام</h1>
      <p class="lead">تم إرسال طلبك إلى فريق سرح للمراجعة. سيتم التواصل معك بعد مراجعة الطلب.</p>
    </section>
    <section class="card">
      <div class="summary"><span>رقم الطلب</span><b>${number}</b></div>
      ${name}
      <div class="summary"><span>الحالة</span><b>قيد المراجعة</b></div>
    </section>
    <a class="btn" href="/join" style="display:block;text-align:center;text-decoration:none;">العودة لصفحة الانضمام</a>
    <a class="login" href="https://sarhsa.online/butcher/login">تسجيل الدخول إلى لوحة الملحمة</a>
  `;
  return shell('تم استلام طلب الانضمام', body);
}
