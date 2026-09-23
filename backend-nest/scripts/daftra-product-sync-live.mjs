#!/usr/bin/env node
/**
 * Live: create one Daftra product (if needed), then run Sarh sync twice via Prisma.
 *
 * Requires:
 *   DAFTRA_LIVE_SYNC=1
 *   DAFTRA_ACCOUNT_IDENTIFIER
 *   DAFTRA_API_KEY
 *   DATABASE_URL
 *   JWT_SECRET or SECRETS_ENCRYPTION_KEY (32+)
 *
 * Never prints API keys.
 */
'use strict';

import { createHash, createCipheriv, randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';

function isOkResult(result) {
  const t = String(result || '').toLowerCase();
  return t === 'success' || t === 'successful';
}

function resolveKey() {
  const dedicated = process.env.SECRETS_ENCRYPTION_KEY?.trim();
  if (dedicated && dedicated.length >= 32) {
    return createHash('sha256').update(dedicated).digest();
  }
  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('SECRETS_ENCRYPTION_KEY or JWT_SECRET (32+) required');
  }
  return createHash('sha256').update(`sarh-daftra-v1:${jwtSecret}`).digest();
}

function encryptSecret(plaintext) {
  const key = resolveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    last4: plaintext.trim().slice(-4),
  };
}

async function daftraFetch(path, { method = 'GET', body } = {}) {
  const account = process.env.DAFTRA_ACCOUNT_IDENTIFIER.trim().toLowerCase();
  const apiKey = process.env.DAFTRA_API_KEY.trim();
  const url = `https://${account}.daftra.com/api2${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      APIKEY: apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { httpStatus: res.status, body: json };
}

async function ensureDaftraProduct() {
  const list = await daftraFetch('/products.json?page=1&limit=20');
  if (!isOkResult(list.body?.result) && list.httpStatus >= 400) {
    throw new Error(`products_list_failed_${list.httpStatus}`);
  }
  const rows = Array.isArray(list.body?.data) ? list.body.data : [];
  const existing = rows
    .map((r) => r?.Product ?? r)
    .find(
      (p) =>
        p &&
        typeof p === 'object' &&
        String(p.product_code || '').startsWith('SARH-SYNC-'),
    );
  if (existing?.id) {
    return {
      id: Number(existing.id),
      name: String(existing.name || ''),
      code: String(existing.product_code || ''),
      created: false,
    };
  }

  const code = `SARH-SYNC-${Date.now().toString(36).toUpperCase()}`;
  const created = await daftraFetch('/products.json', {
    method: 'POST',
    body: {
      Product: {
        name: 'منتج تجريبي سرح',
        description: 'منتج اختبار مزامنة سرح من دفترة',
        unit_price: 49.5,
        product_code: code,
        track_stock: 1,
        stock_balance: 7,
        type: 1,
      },
    },
  });

  const idFromBody =
    Number(created.body?.id) ||
    Number(created.body?.data?.Product?.id) ||
    Number(created.body?.data?.id);
  if (!idFromBody || created.httpStatus >= 400) {
    throw new Error(
      `product_create_failed_${created.httpStatus}_${created.body?.result || 'no_result'}`,
    );
  }
  return {
    id: idFromBody,
    name: 'منتج تجريبي سرح',
    code,
    created: true,
  };
}

async function main() {
  if (process.env.DAFTRA_LIVE_SYNC !== '1') {
    console.log(JSON.stringify({ skipped: true, reason: 'Set DAFTRA_LIVE_SYNC=1' }));
    process.exit(0);
  }
  if (
    !process.env.DAFTRA_ACCOUNT_IDENTIFIER?.trim() ||
    !process.env.DAFTRA_API_KEY?.trim() ||
    !process.env.DATABASE_URL?.trim()
  ) {
    console.error(JSON.stringify({ ok: false, error: 'missing_env' }));
    process.exit(2);
  }

  const prisma = new PrismaClient();
  const account = process.env.DAFTRA_ACCOUNT_IDENTIFIER.trim().toLowerCase();
  const apiKey = process.env.DAFTRA_API_KEY.trim();

  try {
    const remote = await ensureDaftraProduct();

    let user = await prisma.user.findFirst({
      where: { username: 'daftra-sync-admin' },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          username: 'daftra-sync-admin',
          passwordHash: 'not-used-for-script',
          displayName: 'Daftra Sync Admin',
          arabicName: 'مشرف مزامنة',
          role: 'ADMIN',
          country: 'SA',
        },
      });
    }

    let butcherUser = await prisma.user.findFirst({
      where: { username: 'daftra-sync-butcher' },
    });
    if (!butcherUser) {
      butcherUser = await prisma.user.create({
        data: {
          username: 'daftra-sync-butcher',
          passwordHash: 'not-used-for-script',
          displayName: 'Daftra Sync Butcher',
          arabicName: 'ملحمة مزامنة',
          role: 'BUTCHER',
          country: 'SA',
        },
      });
    }

    let butcher = await prisma.butcher.findUnique({
      where: { userId: butcherUser.id },
    });
    if (!butcher) {
      butcher = await prisma.butcher.create({
        data: {
          userId: butcherUser.id,
          nameAr: 'ملحمة اختبار دفترة',
          nameEn: 'Daftra Test Butcher',
          country: 'SA',
          city: 'Riyadh',
          cityAr: 'الرياض',
          address: 'Test',
          addressAr: 'اختبار',
          phone: '0500000000',
          specialties: [],
        },
      });
    }

    const enc = encryptSecret(apiKey);
    await prisma.butcherDaftraIntegration.upsert({
      where: { butcherId: butcher.id },
      create: {
        butcherId: butcher.id,
        accountIdentifier: account,
        apiKeyCiphertext: enc.ciphertext,
        apiKeyIv: enc.iv,
        apiKeyTag: enc.tag,
        apiKeyLast4: enc.last4,
        authMethod: 'API_KEY',
        status: 'CONNECTED',
        lastConnectionTestAt: new Date(),
        lastConnectionError: null,
      },
      update: {
        accountIdentifier: account,
        apiKeyCiphertext: enc.ciphertext,
        apiKeyIv: enc.iv,
        apiKeyTag: enc.tag,
        apiKeyLast4: enc.last4,
        status: 'CONNECTED',
        lastConnectionTestAt: new Date(),
        lastConnectionError: null,
      },
    });

    // Dynamic import compiled service is heavy; replicate upsert via same uniqueness rules.
    const { createDaftraClient } = await import(
      '../dist/integrations/daftra/daftra.client.js'
    ).catch(() => ({ createDaftraClient: null }));

    let pages = 0;
    let fetched = 0;
    const products = [];
    if (createDaftraClient) {
      const client = createDaftraClient({
        accountIdentifier: account,
        apiKey,
      });
      let page = 1;
      let pageCount = 1;
      while (page <= pageCount) {
        const res = await client.get('/products.json', { page, limit: 100 });
        const { mapDaftraProductPage } = await import(
          '../dist/integrations/daftra/daftra.mappers.js'
        );
        const mapped = mapDaftraProductPage(res.body);
        pages += 1;
        pageCount = mapped.pageCount || 1;
        fetched += mapped.items.length;
        products.push(...mapped.items);
        if (!mapped.items.length) break;
        page += 1;
      }
    } else {
      const list = await daftraFetch('/products.json?page=1&limit=100');
      const rows = Array.isArray(list.body?.data) ? list.body.data : [];
      pages = 1;
      fetched = rows.length;
      for (const row of rows) {
        const p = row?.Product ?? row;
        if (p?.id) {
          products.push({
            id: Number(p.id),
            name: String(p.name || ''),
            sku: p.product_code ? String(p.product_code) : null,
            price: p.unit_price != null ? Number(p.unit_price) : null,
            quantity: p.stock_balance != null ? Number(p.stock_balance) : null,
            trackStock: Number(p.track_stock) === 1,
            barcode: p.barcode ? String(p.barcode) : null,
            description: p.description ? String(p.description) : null,
          });
        }
      }
    }

    async function upsertOnce() {
      let created = 0;
      let updated = 0;
      for (const remote of products) {
        if (!remote.name?.trim()) continue;
        const name = remote.name.trim().slice(0, 100);
        const qty =
          remote.quantity != null && Number.isFinite(remote.quantity)
            ? Math.max(0, remote.quantity)
            : 0;
        const price =
          remote.price != null && Number.isFinite(remote.price) && remote.price > 0
            ? remote.price
            : null;
        const description = (
          remote.description?.trim()?.length >= 5
            ? remote.description.trim()
            : `${name} — مستورد من دفترة`
        ).slice(0, 1000);

        const link = await prisma.butcherDaftraProduct.findUnique({
          where: {
            butcherId_daftraProductId: {
              butcherId: butcher.id,
              daftraProductId: remote.id,
            },
          },
        });

        if (link?.sarhProductId) {
          const local = await prisma.butcherProduct.findFirst({
            where: {
              id: link.sarhProductId,
              butcherId: butcher.id,
              deletedAt: null,
            },
          });
          if (local) {
            await prisma.butcherProduct.update({
              where: { id: local.id },
              data: {
                nameAr: name,
                nameEn: name,
                priceFixed: price,
                availableQuantity: qty,
                inStock: remote.trackStock ? qty > 0 : true,
                descriptionAr: description,
                descriptionEn: description,
              },
            });
            await prisma.butcherDaftraProduct.update({
              where: { id: link.id },
              data: {
                daftraProductCode: remote.sku,
                lastKnownQuantity: remote.quantity,
                lastSyncedAt: new Date(),
              },
            });
            updated += 1;
            continue;
          }
        }

        const createdProduct = await prisma.butcherProduct.create({
          data: {
            butcherId: butcher.id,
            nameAr: name,
            nameEn: name,
            category: 'special_orders',
            images: [],
            priceFixed: price,
            availableCuts: ['عام'],
            availableQuantity: qty,
            inStock: remote.trackStock ? qty > 0 : true,
            freshness: 'fresh',
            descriptionAr: description,
            descriptionEn: description,
            country: butcher.country,
          },
        });
        await prisma.butcherDaftraProduct.upsert({
          where: {
            butcherId_daftraProductId: {
              butcherId: butcher.id,
              daftraProductId: remote.id,
            },
          },
          create: {
            butcherId: butcher.id,
            daftraProductId: remote.id,
            sarhProductId: createdProduct.id,
            daftraProductCode: remote.sku,
            lastKnownQuantity: remote.quantity,
            lastSyncedAt: new Date(),
          },
          update: {
            sarhProductId: createdProduct.id,
            daftraProductCode: remote.sku,
            lastKnownQuantity: remote.quantity,
            lastSyncedAt: new Date(),
          },
        });
        created += 1;
      }
      return { created, updated };
    }

    const first = await upsertOnce();
    const second = await upsertOnce();

    const linkCount = await prisma.butcherDaftraProduct.count({
      where: { butcherId: butcher.id },
    });
    const productCount = await prisma.butcherProduct.count({
      where: { butcherId: butcher.id, deletedAt: null },
    });
    const linked = await prisma.butcherDaftraProduct.findUnique({
      where: {
        butcherId_daftraProductId: {
          butcherId: butcher.id,
          daftraProductId: remote.id,
        },
      },
      include: { sarhProduct: true },
    });

    const summary = {
      ok: Boolean(
        linked?.sarhProductId &&
          first.created + first.updated >= 1 &&
          second.created === 0 &&
          productCount === linkCount,
      ),
      accountHost: `${account}.daftra.com`,
      daftraProductId: remote.id,
      daftraProductCreated: remote.created,
      fetched,
      pages,
      first,
      second,
      sarhProductId: linked?.sarhProductId ?? null,
      sarhProductName: linked?.sarhProduct?.nameAr ?? null,
      productCount,
      linkCount,
      statusMasked: true,
    };

    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: 'unexpected',
      message: err?.message ? String(err.message) : 'unknown',
    }),
  );
  process.exit(1);
});
