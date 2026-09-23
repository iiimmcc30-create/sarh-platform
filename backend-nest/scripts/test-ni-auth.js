/**
 * Quick NI connectivity check — reads credentials from .env only.
 * Usage: node scripts/test-ni-auth.js
 */
require('dotenv').config();
const axios = require('axios');

function gatewayBase() {
  return (process.env.NI_BASE_URL || 'https://api-gateway.sandbox.ngenius-payments.com')
    .replace(/\/+$/, '')
    .replace(/\/networkapi$/i, '');
}

function basicAuthHeader() {
  const pre = process.env.NI_BASIC_AUTH?.trim();
  if (pre) return pre.startsWith('Basic ') ? pre : `Basic ${pre}`;
  const key = process.env.NI_API_KEY?.trim() || '';
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

(async () => {
  const base = gatewayBase();
  const realm =
    process.env.NI_REALM?.trim() ||
    process.env.NI_CHAIN_ID?.trim() ||
    'ni';
  console.log('Testing NI identity at', base);
  console.log('Realm/Chain:', realm);
  console.log('Outlet:', process.env.NI_OUTLET_ID);

  const bodies = [
    { grant_type: 'client_credentials', realm },
    { realmName: realm },
    { realmName: 'ni' },
    {},
  ];

  for (const body of bodies) {
    try {
      const r = await axios.post(`${base}/identity/auth/access-token`, body, {
        headers: {
          Authorization: basicAuthHeader(),
          'Content-Type': 'application/vnd.ni-identity.v1+json',
          Accept: 'application/vnd.ni-identity.v1+json',
        },
        timeout: 15000,
        validateStatus: () => true,
      });
      const ok = !!r.data?.access_token;
      console.log(
        'body',
        JSON.stringify(body),
        '=>',
        r.status,
        ok ? 'TOKEN_OK' : (r.data?.errors?.[0]?.message || r.data?.message || 'no'),
      );
      if (ok) {
        console.log('OK — access token received');
        process.exit(0);
      }
    } catch (e) {
      console.log('ERR', e.message);
    }
  }
  console.log('FAIL — no token');
  process.exit(1);
})();
