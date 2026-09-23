const sendMail = jest.fn();
const verify = jest.fn();

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(() => ({ sendMail, verify })),
  },
}));

import { EmailProcessor } from './email.processor';

describe('EmailProcessor', () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  let processor: EmailProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PASS = 'secret';
    process.env.EMAIL_FROM = 'sarh@sarhsa.online';
    processor = new EmailProcessor(logger as never);
  });

  function job(data: Record<string, unknown>) {
    return { name: 'send', data } as never;
  }

  it('sends a sanitized OTP email', async () => {
    await processor.process(
      job({
        to: 'buyer@sarhsa.online',
        subject: 'تأكيد البريد الإلكتروني — سرح',
        template: 'email_verification',
        variables: { name: 'علي', code: '123456' },
      }),
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'buyer@sarhsa.online',
        subject: 'تأكيد البريد الإلكتروني — سرح',
      }),
    );
    expect(String(sendMail.mock.calls[0][0].html)).toContain('123456');
  });

  it('does not send when To contains CRLF injection', async () => {
    await processor.process(
      job({
        to: 'buyer@sarhsa.online\r\nBcc: attacker@evil.com',
        subject: 'hi',
        template: 'email_verification',
        variables: { code: '111111' },
      }),
    );
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('escapes HTML in user-supplied variables', async () => {
    await processor.process(
      job({
        to: 'buyer@sarhsa.online',
        subject: 'order',
        template: 'order_update',
        variables: { status: '<script>alert(1)</script>' },
      }),
    );
    const html = String(sendMail.mock.calls[0][0].html);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not pass envelope, headers, or attachments from the job', async () => {
    await processor.process(
      job({
        to: 'buyer@sarhsa.online',
        subject: 'hi',
        template: 'welcome',
        variables: { name: 'Ali' },
        envelope: { to: 'other@x.com' },
        headers: { Bcc: 'evil@x.com' },
        attachments: [{ path: 'https://evil.test/x' }],
      }),
    );
    const payload = sendMail.mock.calls[0][0];
    expect(payload.envelope).toBeUndefined();
    expect(payload.headers).toBeUndefined();
    expect(payload.attachments).toBeUndefined();
  });
});
