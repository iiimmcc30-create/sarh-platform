import { readFileSync } from 'fs';
import path from 'path';
import {
  CONTACT_MESSAGE_MIN,
  FRAUD_SAFETY_TIPS,
  HELP_CATEGORY_ICON,
  HELP_CATEGORY_ORDER,
  HELP_HUB_SECTIONS,
  buildFraudReportDescription,
  contactMessageError,
  contactTicketPayload,
  fraudReportError,
  isFaqCategory,
  isHelpSearchReady,
  isSafeHelpRoute,
} from '../lib/helpCenter';
import { FAQ_CATEGORY_LABEL_AR, SERVICE_STATUS_DEFAULT, TICKET_CATEGORY_LABEL_AR } from '../services/support';

const src = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('help center hub', () => {
  const hub = src('app/support/index.tsx');

  it('renders sections in the required order, create-ticket last', () => {
    expect(HELP_HUB_SECTIONS).toEqual([
      'status',
      'search',
      'categories',
      'top',
      'fraud',
      'assistant',
      'tickets',
      'reports',
      'createTicket',
    ]);
    const markers = [
      'fetchServiceStatus',
      'ابحث في مركز المساعدة',
      'title="التصنيفات"',
      'الأكثر سؤالاً',
      'accessibilityLabel="بلّغ عن احتيال"',
      'accessibilityLabel="اسأل مساعد سرح"',
      'title="تذاكري"',
      'title="بلاغاتي"',
      'title="إنشاء تذكرة"',
    ];
    const at = markers.map((m) => hub.lastIndexOf(m));
    at.forEach((i) => expect(i).toBeGreaterThan(-1));
    // Rendering order in JSX (status call happens in the effect, before JSX).
    const jsx = markers.slice(1).map((m) => hub.indexOf(m, hub.indexOf('<Screen')));
    expect([...jsx].sort((a, b) => a - b)).toEqual(jsx);
  });

  it('shows «بلاغاتي» linking to the my-reports screen and has no delivery content', () => {
    expect(hub).toContain('title="بلاغاتي"');
    expect(hub).toContain('router.push(MY_REPORTS_ROUTE');
    expect(hub).not.toMatch(/توصيل|مندوب|ملحم|جزار/);
  });

  it('every FAQ category has an Arabic label and an icon, in backend order', () => {
    expect(HELP_CATEGORY_ORDER).toHaveLength(13);
    for (const cat of HELP_CATEGORY_ORDER) {
      expect(FAQ_CATEGORY_LABEL_AR[cat]).toBeTruthy();
      expect(HELP_CATEGORY_ICON[cat]).toBeTruthy();
    }
    expect(isFaqCategory('COUNCILS')).toBe(true);
    expect(isFaqCategory('ORDERS')).toBe(false);
  });

  it('only allows in-app deep links on FAQ action buttons', () => {
    expect(isSafeHelpRoute('/promote')).toBe(true);
    expect(isSafeHelpRoute('/profile/settings/password')).toBe(true);
    expect(isSafeHelpRoute('/(tabs)/messages')).toBe(true);
    expect(isSafeHelpRoute('https://evil.example')).toBe(false);
    expect(isSafeHelpRoute('//evil.example')).toBe(false);
    expect(isSafeHelpRoute('javascript:alert(1)')).toBe(false);
    expect(isSafeHelpRoute('/a b')).toBe(false);
    expect(isSafeHelpRoute(null)).toBe(false);
  });

  it('search waits for at least 2 characters', () => {
    expect(isHelpSearchReady(' ا ')).toBe(false);
    expect(isHelpSearchReady('رمز')).toBe(true);
  });

  it('defaults the service status line', () => {
    expect(SERVICE_STATUS_DEFAULT).toEqual({ state: 'ok', textAr: 'كل الخدمات تعمل بشكل طبيعي' });
  });
});

describe('fraud report', () => {
  const screen = src('app/support/fraud.tsx');

  it('creates a FRAUD ticket via the real API', () => {
    expect(screen).toContain("category: 'FRAUD'");
    expect(screen).toContain('createTicket');
    expect(TICKET_CATEGORY_LABEL_AR.FRAUD).toBe('بلاغ احتيال');
    expect(FRAUD_SAFETY_TIPS.length).toBeGreaterThanOrEqual(3);
  });

  it('validates details and prefixes the reported target', () => {
    expect(fraudReportError('')).toBeTruthy();
    expect(fraudReportError('قصير')).toBeTruthy();
    expect(fraudReportError('طلب مني عربون وحظرني بعدها')).toBeNull();
    expect(buildFraudReportDescription({ target: '@x', details: 'تفاصيل البلاغ' })).toContain('@x');
    expect(buildFraudReportDescription({ details: ' تفاصيل ' })).toBe('تفاصيل');
  });
});

describe('contact form', () => {
  const screen = src('app/info/contact.tsx');

  it('creates a ticket instead of opening mailto', () => {
    expect(screen).toContain('createTicket(contactTicketPayload');
    expect(screen).not.toContain('mailto:sarh@sarhsa.online?subject');
  });

  it('validates and builds the payload', () => {
    expect(contactMessageError({ name: '', message: 'x'.repeat(CONTACT_MESSAGE_MIN) })).toBeTruthy();
    expect(contactMessageError({ name: 'متعب', message: 'قصيرة' })).toBeTruthy();
    expect(contactMessageError({ name: 'متعب', message: 'عندي استفسار عن الاشتراك' })).toBeNull();
    expect(contactTicketPayload({ name: ' متعب ', message: ' عندي استفسار عن الاشتراك ' })).toEqual({
      category: 'OTHER',
      subject: 'رسالة من متعب',
      description: 'عندي استفسار عن الاشتراك',
    });
  });
});

describe('entry points are unified on /support', () => {
  it('settings and the legacy support menu lead to the hub', () => {
    expect(src('lib/settingsRows.ts')).toContain("route: '/support'");
    expect(src('app/settings/support.tsx')).toContain("href={'/support' as never}");
    expect(src('app/settings/info.tsx')).toContain("route: '/support'");
    expect(src('app/(tabs)/more.tsx')).toContain('/support');
  });
});
