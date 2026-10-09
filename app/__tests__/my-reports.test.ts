import { readFileSync } from 'fs';
import path from 'path';
import {
  MY_REPORTS_ROUTE,
  REPORT_STATE_LABEL_AR,
  reportKindLabelAr,
  reportStateFor,
} from '../lib/myReports';

const src = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('«بلاغاتي» (my reports)', () => {
  it('maps every ticket status onto the three Arabic pills', () => {
    expect(REPORT_STATE_LABEL_AR).toEqual({ open: 'مفتوح', review: 'قيد المراجعة', closed: 'مغلق' });
    expect(reportStateFor('OPEN')).toBe('open');
    expect(reportStateFor('AWAITING_USER')).toBe('open');
    expect(reportStateFor('WAITING_FOR_CUSTOMER')).toBe('open');
    expect(reportStateFor('IN_REVIEW')).toBe('review');
    expect(reportStateFor('AI_ASSISTING')).toBe('review');
    expect(reportStateFor('WAITING_FOR_SUPPORT')).toBe('review');
    expect(reportStateFor('IN_PROGRESS')).toBe('review');
    expect(reportStateFor('RESOLVED')).toBe('closed');
    expect(reportStateFor('CLOSED')).toBe('closed');
  });

  it('labels the report kind and target in Arabic', () => {
    expect(reportKindLabelAr('FRAUD', null)).toBe('بلاغ احتيال');
    expect(reportKindLabelAr('REPORT', 'listing')).toBe('بلاغ على إعلان');
    expect(reportKindLabelAr('REPORT', 'user')).toBe('بلاغ على حساب');
    expect(reportKindLabelAr('REPORT', null)).toBe('بلاغ');
  });

  it('the screen lists own reports, opens the ticket thread and has an empty state', () => {
    const screen = src('app/support/reports.tsx');
    expect(screen).toContain('fetchMyReports');
    expect(screen).toContain("pathname: '/support/tickets/[id]'");
    expect(screen).toContain('ما عندك بلاغات');
    expect(screen).toContain('title="بلاغاتي"');
    expect(screen).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(src('services/support.ts')).toContain('/api/support/reports?page=');
    expect(src('app/_layout.tsx')).toContain('name="support/reports"');
    expect(MY_REPORTS_ROUTE).toBe('/support/reports');
  });

  it('fraud copy points to «بلاغاتي» instead of tickets', () => {
    const fraud = src('app/support/fraud.tsx');
    expect(fraud).toContain('«بلاغاتي»');
    expect(fraud).not.toContain('يجيك في تذاكري');
  });
});

describe('company contact phone removed', () => {
  it.each(['app/info/about.tsx', 'app/info/contact.tsx', 'app/info/privacy.tsx', 'app/info/terms.tsx', 'constants/sarhOfficial.ts'])(
    '%s has no company phone / WhatsApp link',
    (rel) => {
      const s = src(rel);
      expect(s).not.toMatch(/591\s?298\s?136|0591298136|966591298136|wa\.me\/966591/);
    },
  );
});
