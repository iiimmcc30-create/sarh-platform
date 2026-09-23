import {
  escapeHtml,
  isAllowedEmailTemplate,
  isSafeEmailAddress,
  sanitizeEmailVariable,
  sanitizeHeaderValue,
  sanitizeHttpUrl,
  sanitizeMultilineHtml,
} from './email.sanitize';

describe('email.sanitize', () => {
  it('rejects CRLF and extra recipients in the To header', () => {
    expect(isSafeEmailAddress('user@sarhsa.online')).toBe(true);
    expect(isSafeEmailAddress('user@sarhsa.online\r\nBcc: evil@x.com')).toBe(
      false,
    );
    expect(isSafeEmailAddress('a@b.com,c@d.com')).toBe(false);
    expect(isSafeEmailAddress('not-an-email')).toBe(false);
  });

  it('strips header injection from subject-like values', () => {
    expect(sanitizeHeaderValue('Hello\r\nBcc: evil@x.com')).toBe(
      'HelloBcc: evil@x.com',
    );
  });

  it('escapes HTML interpolated into templates', () => {
    expect(escapeHtml(`<img src=x onerror=alert(1)>`)).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
    expect(sanitizeEmailVariable('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
  });

  it('only allows http(s) login URLs', () => {
    expect(sanitizeHttpUrl('https://daftra.example/login')).toContain(
      'https://daftra.example/login',
    );
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeHttpUrl('file:///etc/passwd')).toBe('');
  });

  it('turns newlines into br after escaping', () => {
    expect(sanitizeMultilineHtml('a\n<b>')).toBe('a<br/>&lt;b&gt;');
  });

  it('allowlists known templates only', () => {
    expect(isAllowedEmailTemplate('email_verification')).toBe(true);
    expect(isAllowedEmailTemplate('jsonTransport')).toBe(false);
  });
});
