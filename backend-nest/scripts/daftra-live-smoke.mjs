#!/usr/bin/env node
/**
 * Live Daftra smoke test (API Key — documented Method 1).
 *
 * Requires ENV (never commit values):
 *   DAFTRA_ACCOUNT_IDENTIFIER=<subdomain>
 *   DAFTRA_API_KEY=<api key string, not Key ID>
 *   DAFTRA_LIVE_SMOKE=1
 *
 * Exit 0 on PASS. Prints only non-secret summaries.
 */
'use strict';

function isOkResult(result) {
  const t = String(result || '').toLowerCase();
  return t === 'success' || t === 'successful';
}

async function main() {
  if (process.env.DAFTRA_LIVE_SMOKE !== '1') {
    console.log(
      JSON.stringify({
        skipped: true,
        reason:
          'Set DAFTRA_LIVE_SMOKE=1 plus DAFTRA_ACCOUNT_IDENTIFIER and DAFTRA_API_KEY',
      }),
    );
    process.exit(0);
  }

  const account = (process.env.DAFTRA_ACCOUNT_IDENTIFIER || '').trim();
  const apiKey = (process.env.DAFTRA_API_KEY || '').trim();
  if (!account || !apiKey) {
    console.error(
      JSON.stringify({
        ok: false,
        error: 'missing_env',
        need: ['DAFTRA_ACCOUNT_IDENTIFIER', 'DAFTRA_API_KEY'],
      }),
    );
    process.exit(2);
  }

  const origin = `https://${account.toLowerCase()}.daftra.com`;
  const headers = {
    Accept: 'application/json',
    APIKEY: apiKey,
  };

  const infoUrl = `${origin}/api2/api_key_info.json`;
  const productsUrl = `${origin}/api2/products.json?page=1&limit=5`;

  const infoRes = await fetch(infoUrl, { headers });
  let infoBody;
  try {
    infoBody = await infoRes.json();
  } catch {
    infoBody = null;
  }

  const infoOk =
    infoRes.status >= 200 &&
    infoRes.status < 300 &&
    infoBody &&
    isOkResult(infoBody.result);

  const productsRes = await fetch(productsUrl, { headers });
  let productsBody;
  try {
    productsBody = await productsRes.json();
  } catch {
    productsBody = null;
  }

  const productsOk =
    productsRes.status >= 200 &&
    productsRes.status < 300 &&
    productsBody != null &&
    (productsBody.result == null || isOkResult(productsBody.result));

  // Auth is proven if products accept the key (api_key_info is missing on some tenants).
  const authOk = productsOk || infoOk;
  const summary = {
    ok: Boolean(authOk && productsOk),
    host: `${account.toLowerCase()}.daftra.com`,
    apiKeyInfo: {
      httpStatus: infoRes.status,
      result: infoBody && infoBody.result,
      code: infoBody && infoBody.code,
      keyId: infoBody && infoBody.data && infoBody.data.id,
      keyName: infoBody && infoBody.data && infoBody.data.name,
      note:
        infoRes.status === 404
          ? 'endpoint_missing_on_tenant_fallback_products'
          : undefined,
    },
    products: {
      httpStatus: productsRes.status,
      result: productsBody && productsBody.result,
      itemCount: Array.isArray(productsBody && productsBody.data)
        ? productsBody.data.length
        : Array.isArray(productsBody)
          ? productsBody.length
          : null,
    },
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: 'unexpected',
      message: err && err.message ? String(err.message) : 'unknown',
    }),
  );
  process.exit(1);
});
