import {
  escapeJoinHtml,
  renderButcherJoinPage,
  renderButcherJoinSuccessPage,
} from '../join-page.html';

describe('public butcher join HTML', () => {
  const html = renderButcherJoinPage();

  it('renders the dark Sarh registration page', () => {
    expect(html).toContain('انضمام الملاحم');
    expect(html).toContain('#07131C');
    expect(html).toContain('#20B66F');
    expect(html).toContain('/api/auth/send-otp');
    expect(html).toContain('/api/auth/verify-otp');
    expect(html).toContain('/api/butcher-applications/join');
    expect(html).toContain("purpose: 'join'");
    expect(html).toContain('https://sarhsa.online/butcher/login');
    expect(html).toContain('/join/success');
    expect(html).not.toMatch(/APIKEY|apiKey|password_hash|JWT_SECRET/i);
  });

  it('shows every required snapshot field from /butchers/apply', () => {
    for (const id of [
      'displayName',
      'username',
      'email',
      'nameAr',
      'nameEn',
      'shopPhone',
      'commercialReg',
      'country',
      'city',
      'cityAr',
      'address',
      'addressAr',
      'lat',
      'lng',
      'bioAr',
      'bioEn',
      'specialties',
      'openTime',
      'closeTime',
      'acceptedTerms',
      'confirmAccuracy',
      'accountUsername',
      'accountPassword',
      'accountPasswordConfirm',
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('shows every document slot from the in-app wizard', () => {
    for (const id of [
      'commercial_license',
      'national_id',
      'municipal_permit',
      'shop_photo',
      'other',
    ]) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`type="file"`);
    }
    expect(html).toContain('السجل التجاري');
    expect(html).toContain('الهوية الوطنية');
    expect(html).toContain('تصريح البلدية');
    expect(html).toContain('صورة المحل');
  });

  it('validates files and blocks submit without OTP, terms, or required docs', () => {
    expect(html).toContain('REQUIRED_DOCS');
    expect(html).toContain("if (!token)");
    expect(html).toContain('يجب الموافقة على الشروط');
    expect(html).toContain('يجب تأكيد صحة البيانات');
    expect(html).toContain('مستند مطلوب غير مرفوع');
    expect(html).toContain('نوع الملف غير مدعوم');
    expect(html).toContain('new FormData()');
    expect(html).toContain("form.append('phone_token'");
    expect(html).not.toContain('lat: 24.7136');
  });

  it('does not leak tokens on the success page', () => {
    const success = renderButcherJoinSuccessPage({
      applicationNumber: '12',
      nameAr: 'ملحمة النخيل',
    });
    expect(success).toContain('تم استلام طلب الانضمام');
    expect(success).toContain('#12');
    expect(success).not.toMatch(/phone_token|JWT|Bearer |api_secret/i);
  });

  it('escapes success query values', () => {
    const page = renderButcherJoinSuccessPage({
      applicationNumber: '<script>',
      nameAr: 'ملحمة "أ"',
    });
    expect(page).toContain('#&lt;script&gt;');
    expect(page).toContain('ملحمة &quot;أ&quot;');
    expect(page).not.toContain('<script>');
  });

  it('escapes HTML entities', () => {
    expect(escapeJoinHtml('a <b> & "c"')).toBe(
      'a &lt;b&gt; &amp; &quot;c&quot;',
    );
  });
});
