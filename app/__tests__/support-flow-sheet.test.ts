import { readFileSync } from 'fs';
import path from 'path';
import {
  SUPPORT_FLOW_CHOICES,
  findSupportFlowChoice,
  isSupportDescriptionValid,
  supportDescriptionError,
  userFacingTicketStatus,
} from '../lib/supportFlow';

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

  it('opens the help center as a large bottom sheet, not a card hub', () => {
    expect(hub).toContain('SupportFlowSheet');
    expect(hub).not.toContain('SettingsMenuScreen');
    expect(sheet).toContain('animationType="slide"');
    expect(sheet).toContain('مركز المساعدة');
    expect(sheet).toContain('كيف يمكننا مساعدتك؟');
    expect(sheet).toContain('بلاغاتي');
    expect(layout).toContain("name=\"support/index\"");
    expect(layout).toContain("presentation: 'transparentModal'");
  });

  it('maps choices onto existing ticket categories without a new taxonomy', () => {
    const ids = SUPPORT_FLOW_CHOICES.map((c) => c.category);
    expect(ids).toEqual(
      expect.arrayContaining(['ORDER_HELP', 'ACCOUNT', 'ADS', 'PAYMENT', 'OTHER']),
    );
    expect(findSupportFlowChoice('ORDER_HELP')?.needsOrder).toBe(true);
    expect(findSupportFlowChoice('ACCOUNT')?.helpKind).toBe('OTHER_HELP');
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
    expect(sheet).toContain('helpKind: choice.helpKind');
    expect(sheet).not.toContain('fake');
    expect(sheet).not.toContain('mock');
  });

  it('uses a single bundled Sarhan avatar asset', () => {
    expect(identity).toContain("require('../assets/images/sarhan-avatar.jpg')");
    expect(identity).toContain("assistantName: 'سرحان'");
    expect(sheet).toContain('avatarSource');
    expect(sheet).not.toContain('https://');
  });

  it('reuses the same sheet for order-help deep links', () => {
    expect(help).toContain('initialChoiceId="ORDER_HELP"');
    expect(help).toContain('presetOrderId');
  });

  it('uses press opacity for option rows, not pressScale', () => {
    expect(sheet).toContain('motion.press.opacity');
    expect(sheet).not.toMatch(/opacity:\s*motion\.pressScale/);
  });

  it('never shows internal bot-off copy to the user', () => {
    expect(sheet).not.toContain('سرحان لن يرد');
    expect(sheet).not.toContain('تم تعطيل البوت');
    expect(userFacingTicketStatus('WAITING_FOR_SUPPORT')).toBe(
      'تم تحويل طلبك للفريق المختص',
    );
    expect(userFacingTicketStatus('AI_ASSISTING')).toBe('تم استلام طلبك');
  });
});
