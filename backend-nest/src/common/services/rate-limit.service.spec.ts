import { RateLimitService } from './rate-limit.service';
import type { Request } from 'express';
import type { LoggerService } from './logger.service';

function fakeReq(partial: {
  remoteAddress?: string;
  'x-real-ip'?: string;
  'x-forwarded-for'?: string;
}): Request {
  return {
    socket: { remoteAddress: partial.remoteAddress ?? '127.0.0.1' },
    headers: {
      ...(partial['x-real-ip'] ? { 'x-real-ip': partial['x-real-ip'] } : {}),
      ...(partial['x-forwarded-for']
        ? { 'x-forwarded-for': partial['x-forwarded-for'] }
        : {}),
    },
  } as unknown as Request;
}

describe('RateLimitService.getClientIp', () => {
  const logger = {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  } as unknown as LoggerService;
  const service = new RateLimitService(logger);

  it('uses socket IP when the peer is not a trusted proxy', () => {
    expect(
      service.getClientIp(
        fakeReq({
          remoteAddress: '203.0.113.9',
          'x-forwarded-for': '1.2.3.4',
          'x-real-ip': '9.9.9.9',
        }),
      ),
    ).toBe('203.0.113.9');
  });

  it('prefers X-Real-IP from nginx over spoofed X-Forwarded-For', () => {
    expect(
      service.getClientIp(
        fakeReq({
          remoteAddress: '127.0.0.1',
          'x-forwarded-for': '198.51.100.1, 203.0.113.50',
          'x-real-ip': '203.0.113.50',
        }),
      ),
    ).toBe('203.0.113.50');
  });

  it('falls back to rightmost X-Forwarded-For hop', () => {
    expect(
      service.getClientIp(
        fakeReq({
          remoteAddress: '10.0.0.5',
          'x-forwarded-for': '198.51.100.1, 203.0.113.77',
        }),
      ),
    ).toBe('203.0.113.77');
  });
});
