import axios from 'axios';
import { createNiCheckout, summarizeNiAuthResponse } from './ni-client';
import { redactSensitive } from '../integrations/utils/redact.util';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.SUPER-SECRET-ACCESS-TOKEN-VALUE.sig9Z';
const API_KEY = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo6c2VjcmV0LWtleS12YWx1ZQ==';

describe('NI auth logging never leaks the access token', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.NI_API_KEY = API_KEY;
    process.env.NI_OUTLET_ID = '00000000-0000-4000-8000-000000000001';
    process.env.NI_BASE_URL = 'https://api-gateway.ksa.ngenius-payments.com';
    process.env.NI_REALM = 'ni';
    delete process.env.NI_BASIC_AUTH;
    mockedAxios.isAxiosError.mockReturnValue(false);
  });

  afterEach(() => {
    process.env = { ...saved };
    jest.resetAllMocks();
  });

  it('summarizes an identity response without the token', () => {
    const summary = summarizeNiAuthResponse({
      access_token: TOKEN,
      token_type: 'bearer',
      expires_in: 300,
      refresh_token: 'refresh-secret-value-1234567890',
    });
    const text = JSON.stringify(summary);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain('refresh-secret');
    expect(summary).toMatchObject({
      hasAccessToken: true,
      accessTokenLength: TOKEN.length,
      token_type: 'bearer',
      expires_in: 300,
    });
  });

  it('keeps NI error codes for failed auth', () => {
    const summary = summarizeNiAuthResponse({
      errors: [
        { errorCode: 'invalidCredentials', message: 'bad', domain: 'identity' },
      ],
    });
    expect(summary).toMatchObject({
      hasAccessToken: false,
      errors: [
        { errorCode: 'invalidCredentials', message: 'bad', domain: 'identity' },
      ],
    });
  });

  it('create-order flow logs no token, Authorization header or API key', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({
        status: 200,
        data: { access_token: TOKEN, token_type: 'bearer', expires_in: 300 },
      })
      .mockResolvedValueOnce({
        status: 201,
        data: {
          reference: '11111111-2222-4333-8444-555555555555',
          _links: {
            payment: {
              href: 'https://paypage.ksa.ngenius-payments.com/?code=x',
            },
          },
        },
      });

    const logged: Array<[string, Record<string, unknown>]> = [];
    await createNiCheckout(
      {
        amount: 19,
        currency: 'SAR',
        orderReference: 'PRM-TEST-1',
        description: 'test',
        redirectUrl: 'https://sarhsa.online/payment/result',
        cancelUrl: 'https://sarhsa.online/payment/cancel',
      },
      (event, data) => logged.push([event, data]),
    );

    const text = JSON.stringify(logged);
    expect(logged.some(([e]) => e === 'auth_response')).toBe(true);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(API_KEY);
    expect(text).not.toMatch(/Bearer\s+\S/);
    expect(text).not.toMatch(/Basic\s+\S/);

    // The real request still used the token (behaviour unchanged).
    const orderCall = mockedAxios.post.mock.calls[1];
    expect(
      (orderCall[2] as { headers: Record<string, string> }).headers
        .Authorization,
    ).toBe(`Bearer ${TOKEN}`);
  });

  it('redactSensitive masks tokens without revealing their start', () => {
    const out = JSON.stringify(
      redactSensitive({
        access_token: TOKEN,
        nested: { refresh_token: TOKEN },
      }),
    );
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain(TOKEN.slice(0, 4));
  });
});
