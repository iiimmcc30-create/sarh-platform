import { readFileSync } from 'fs';
import path from 'path';
import {
  SUPPORT_FLOW_CHOICES,
  findSupportFlowChoice,
  isSupportDescriptionValid,
  supportDescriptionError,
  userFacingTicketStatus,
} from '../lib/supportFlow';
import { SUPPORT_ASSISTANT_NAME } from '../constants/supportAssistant';

describe('support flow sheet', () => {
  const hub = readFileSync(path.join(__dirname, '../app/support/index.tsx'), 'utf8');
  const help = readFileSync(path.join(__dirname, '../app/support/help.tsx'), 'utf8');
  const sheet = readFileSync(
    path.join(__dirname, '../components/support/SupportFlowSheet.tsx'),
    'utf8',
  );
  const identity = readFileSync(
    path.join(__dirname, '../constants/supportIdentity.ts'),
    'utf8',
  );
  const layout = readFileSync(path.join(__dirname, '../app/_layout.tsx'), 'utf8');

  it('/support is a full hub screen; the sheet is «اسأل مساعد سرح»', () => {
    expect(hub).not.toContain('SupportFlowSheet');
    expect(hub).not.toContain('SettingsMenuScreen');
    expect(hub).toContain('مركز المساعدة');
    expect(sheet).toContain('<SheetModal');
    expect(sheet).toContain('اسأل مساعد سرح');
    expect(sheet).toContain('وش سؤالك؟');
    expect(sheet).not.toContain('بلاغاتي');
    expect(layout).toContain('name="support/index"');
    expect(layout).toContain('name="support/fraud"');
    expect(layout).toContain("presentation: 'transparentModal'");
  });

  it('maps choices onto existing ticket categories without a new taxonomy', () => {
    const ids = SUPPORT_FLOW_CHOICES.map((c) => c.category);
    expect(ids).toEqual(
      expect.arrayContaining(['ACCOUNT', 'ADS', 'SUBSCRIPTIONS', 'PAYMENT', 'COUNCILS', 'OTHER']),
    );
    expect(findSupportFlowChoice('ACCOUNT')?.helpKind).toBe('OTHER_HELP');
    expect(ids).not.toContain('ORDERS');
    expect(SUPPORT_FLOW_CHOICES.map((c) => c.label).join(' ')).not.toMatch(/طلب|توصيل|ملحم|جزار/);
  });

  it('validates description before submit', () => {
    expect(isSupportDescriptionValid('')).toBe(false);
    expect(isSupportDescriptionValid('أب')).toBe(false);
    expect(isSupportDescriptionValid('المشكلة في الحساب')).toBe(true);
    expect(supportDescriptionError('')).toBeTruthy();
    expect(supportDescriptionError('تمام التفاصيل هنا')).toBeNull();
  });

  it('creates a real ticket then routes into the same support conversation', () => {
    expect(sheet).toContain('createTicket');
    expect(sheet).toContain("pathname: '/support/tickets/[id]'");
    expect(sheet).toContain('helpKind: picked.helpKind');
    expect(sheet).not.toContain('fake');
    expect(sheet).not.toContain('mock');
  });

  it('uses a single bundled assistant avatar and the «مساعد سرح» name', () => {
    expect(identity).toContain("require('../assets/images/sarhan-avatar.jpg')");
    expect(identity).toContain('assistantName: SUPPORT_ASSISTANT_NAME');
    expect(SUPPORT_ASSISTANT_NAME).toBe('مساعد سرح');
    expect(sheet).not.toContain('سرحان');
    expect(hub).not.toContain('سرحان');
    expect(sheet).toContain('avatarSource');
    expect(sheet).not.toContain('https://');
  });

  it('reuses the same sheet for the help deep link without an order step', () => {
    expect(help).toContain('SupportFlowSheet');
    expect(help).not.toContain('presetOrderId');
    expect(sheet).not.toContain("'order'");
  });

  it('uses press opacity for option rows, not pressScale', () => {
    expect(sheet).toContain('motion.press.opacity');
    expect(sheet).not.toMatch(/opacity:\s*motion\.pressScale/);
  });

  it('never shows internal bot-off copy to the user', () => {
    expect(sheet).not.toContain('لن يرد');
    expect(sheet).not.toContain('تم تعطيل البوت');
    expect(userFacingTicketStatus('WAITING_FOR_SUPPORT')).toBe(
      'تم تحويل طلبك للفريق المختص',
    );
    expect(userFacingTicketStatus('AI_ASSISTING')).toBe('تم استلام طلبك');
  });
});
