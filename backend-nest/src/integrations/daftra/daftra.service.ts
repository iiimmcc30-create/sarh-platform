import { Injectable } from '@nestjs/common';
import type { DaftraIntegrationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailQueueService } from '../../queue/services/email-queue.service';
import { LoggerService } from '../../common/services/logger.service';
import { throwApi } from '../../common/exceptions/api.exception';
import {
  decryptSecret,
  encryptSecret,
  maskSecretLast4,
  secretLast4,
} from '../../common/crypto/secret-encryption';
import { appendTimelineEvent } from '../../butcher-applications/helpers/timeline';
import {
  assertValidDaftraAccountIdentifier,
  createDaftraClient,
  createDaftraOAuthClient,
  daftraConnectionLogFields,
  probeDaftraConnection,
  resolveDaftraOrigin,
  testDaftraConnection,
} from './daftra.client';
import type {
  ConfigureDaftraInput,
  DaftraOAuthStatus,
  DaftraProductSyncResult,
  DaftraPublicStatus,
  LinkDaftraProductInput,
  TestDaftraInput,
} from './daftra.types';
import { DaftraClient } from './daftra.http-client';
import {
  DAFTRA_PATHS,
  DAFTRA_PRODUCT_PAGE_DEFAULT,
  DAFTRA_PRODUCT_PAGE_MAX,
} from './daftra.constants';
import { isDaftraRequestError } from './daftra.errors';
import {
  mapDaftraProduct,
  mapDaftraProductPage,
  mapDaftraProductStock,
  mapDaftraProductToSarhFields,
  type DaftraProduct,
  type DaftraProductPage,
  type DaftraProductStock,
} from './daftra.mappers';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import {
  assertDaftraOAuthClientConfigured,
  DAFTRA_OAUTH_PROVIDER,
  DAFTRA_OAUTH_REDIRECT_URI_DEFAULT,
  readDaftraOAuthEnv,
} from './daftra.oauth.config';
import {
  exchangeDaftraPasswordGrant,
  refreshDaftraAccessToken,
} from './daftra.oauth.token';

const LOGIN_URL_RE = /^https:\/\/[^\s]+$/i;

type IntegrationRow = {
  butcherId: string;
  accountIdentifier: string;
  apiKeyCiphertext: string | null;
  apiKeyIv: string | null;
  apiKeyTag: string | null;
  apiKeyLast4: string | null;
  authMethod: 'API_KEY' | 'OAUTH' | 'BOTH';
  oauthProvider: string | null;
  accessTokenCiphertext: string | null;
  accessTokenIv: string | null;
  accessTokenTag: string | null;
  refreshTokenCiphertext: string | null;
  refreshTokenIv: string | null;
  refreshTokenTag: string | null;
  accessTokenExpiresAt: Date | null;
  oauthScopes: string | null;
  oauthConnectedAt: Date | null;
  status: DaftraIntegrationStatus;
  lastConnectionTestAt: Date | null;
  lastConnectionError: string | null;
  daftraLoginEmail: string | null;
  daftraLoginUrl: string | null;
};

function hasApiKey(row: IntegrationRow): boolean {
  return Boolean(
    row.apiKeyCiphertext && row.apiKeyIv && row.apiKeyTag && row.apiKeyLast4,
  );
}

function hasOAuthTokens(row: IntegrationRow): boolean {
  return Boolean(
    row.accessTokenCiphertext && row.accessTokenIv && row.accessTokenTag,
  );
}

function deriveAuthMethod(row: {
  apiKeyCiphertext?: string | null;
  accessTokenCiphertext?: string | null;
}): 'API_KEY' | 'OAUTH' | 'BOTH' {
  const key = Boolean(row.apiKeyCiphertext);
  const oauth = Boolean(row.accessTokenCiphertext);
  if (key && oauth) return 'BOTH';
  if (oauth) return 'OAUTH';
  return 'API_KEY';
}

function toPublicStatus(
  butcherId: string,
  row: IntegrationRow | null,
): DaftraPublicStatus {
  if (!row) {
    return {
      butcherId,
      status: 'NOT_CONFIGURED',
      accountIdentifier: null,
      apiKeyMasked: null,
      authMethod: null,
      oauthConnected: false,
      lastConnectionTestAt: null,
      lastConnectionError: null,
      daftraLoginEmail: null,
      daftraLoginUrl: null,
      configured: false,
    };
  }
  return {
    butcherId,
    status: row.status,
    accountIdentifier: row.accountIdentifier,
    apiKeyMasked: row.apiKeyLast4 ? maskSecretLast4(row.apiKeyLast4) : null,
    authMethod: row.authMethod,
    oauthConnected: hasOAuthTokens(row),
    lastConnectionTestAt: row.lastConnectionTestAt?.toISOString() ?? null,
    lastConnectionError: row.lastConnectionError,
    daftraLoginEmail: row.daftraLoginEmail,
    daftraLoginUrl: row.daftraLoginUrl,
    configured: hasApiKey(row) || hasOAuthTokens(row),
  };
}

@Injectable()
export class DaftraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueueService,
    private readonly logger: LoggerService,
  ) {}

  async getStatus(butcherId: string): Promise<DaftraPublicStatus> {
    await this.assertButcherExists(butcherId);
    const row = await this.prisma.butcherDaftraIntegration.findUnique({
      where: { butcherId },
    });
    return toPublicStatus(butcherId, row);
  }

  async configure(
    adminUserId: string,
    butcherId: string,
    input: ConfigureDaftraInput,
  ): Promise<DaftraPublicStatus> {
    await this.assertButcherExists(butcherId);
    let accountIdentifier: string;
    try {
      accountIdentifier = assertValidDaftraAccountIdentifier(
        input.accountIdentifier,
      );
    } catch {
      throwApi(400, 'invalid_account', 'معرّف حساب دفترة غير صالح');
    }

    const loginEmail = input.daftraLoginEmail?.trim() || null;
    const loginUrl = input.daftraLoginUrl?.trim() || null;
    if (loginUrl && !LOGIN_URL_RE.test(loginUrl)) {
      throwApi(
        400,
        'invalid_login_url',
        'رابط دخول دفترة يجب أن يبدأ بـ https://',
      );
    }

    const existing = await this.prisma.butcherDaftraIntegration.findUnique({
      where: { butcherId },
    });

    const apiKey = input.apiKey?.trim();
    if (!apiKey && !existing) {
      throwApi(400, 'api_key_required', 'مفتاح API مطلوب لإعداد التكامل');
    }
    if (apiKey && apiKey.length < 16) {
      throwApi(400, 'invalid_api_key', 'مفتاح API غير صالح');
    }

    const encrypted = apiKey ? encryptSecret(apiKey) : null;
    const nextCiphertext =
      encrypted?.ciphertext ?? existing?.apiKeyCiphertext ?? null;
    const authMethod = deriveAuthMethod({
      apiKeyCiphertext: nextCiphertext,
      accessTokenCiphertext: existing?.accessTokenCiphertext ?? null,
    });

    const data: Prisma.ButcherDaftraIntegrationUncheckedCreateInput = {
      butcherId,
      accountIdentifier,
      apiKeyCiphertext: nextCiphertext,
      apiKeyIv: encrypted?.iv ?? existing?.apiKeyIv ?? null,
      apiKeyTag: encrypted?.tag ?? existing?.apiKeyTag ?? null,
      apiKeyLast4: apiKey
        ? secretLast4(apiKey)
        : (existing?.apiKeyLast4 ?? null),
      authMethod,
      status: existing?.status === 'DISABLED' ? 'DISABLED' : 'NOT_CONFIGURED',
      daftraLoginEmail: loginEmail,
      daftraLoginUrl: loginUrl,
      lastConnectionError: null,
    };

    const row = await this.prisma.butcherDaftraIntegration.upsert({
      where: { butcherId },
      create: data,
      update: {
        accountIdentifier: data.accountIdentifier,
        apiKeyCiphertext: data.apiKeyCiphertext,
        apiKeyIv: data.apiKeyIv,
        apiKeyTag: data.apiKeyTag,
        apiKeyLast4: data.apiKeyLast4,
        authMethod: data.authMethod,
        status: data.status,
        daftraLoginEmail: data.daftraLoginEmail,
        daftraLoginUrl: data.daftraLoginUrl,
        lastConnectionError: null,
      },
    });

    await this.appendApplicationComment(adminUserId, butcherId, 'CONFIGURE', {
      accountIdentifier,
      keyUpdated: Boolean(apiKey),
    });

    this.logger.info(
      { butcherId, adminUserId, accountIdentifier },
      'Daftra integration configured',
    );

    return toPublicStatus(butcherId, row);
  }

  async testConnection(
    adminUserId: string,
    butcherId: string,
    input: TestDaftraInput = {},
  ): Promise<{
    status: DaftraPublicStatus;
    connected: boolean;
    reason?: string;
    messageAr: string;
  }> {
    await this.assertButcherExists(butcherId);
    const row = (await this.prisma.butcherDaftraIntegration.findUnique({
      where: { butcherId },
    })) as IntegrationRow | null;
    if (!row || (!hasApiKey(row) && !hasOAuthTokens(row))) {
      throwApi(400, 'not_configured', 'تكامل دفترة غير معدّ لهذه الملحمة');
    }
    if (row.status === 'DISABLED') {
      throwApi(409, 'disabled', 'تكامل دفترة معطّل لهذه الملحمة');
    }

    const host = new URL(resolveDaftraOrigin(row.accountIdentifier)).host;
    let result: Awaited<ReturnType<typeof testDaftraConnection>>;
    try {
      const client = await this.clientForButcher(butcherId);
      const probe = await probeDaftraConnection(client);
      result = {
        connected: true,
        httpStatus: probe.httpStatus,
        host,
        path: probe.path,
      };
    } catch (err) {
      if (isDaftraRequestError(err)) {
        result = {
          connected: false,
          reason: err.reason as
            | 'INVALID_API_KEY'
            | 'CONNECTION_FAILED'
            | 'NOT_FOUND'
            | 'RATE_LIMITED'
            | 'UPSTREAM_ERROR'
            | 'INVALID_RESPONSE',
          httpStatus: err.httpStatus,
          safeReason: err.safeMessage,
          host,
          path: DAFTRA_PATHS.apiKeyInfo,
        };
      } else {
        result = {
          connected: false,
          reason: 'CONNECTION_FAILED',
          httpStatus: null,
          safeReason: 'تعذر الاتصال بحساب دفترة',
          host,
          path: DAFTRA_PATHS.apiKeyInfo,
        };
      }
    }

    const nextStatus: DaftraIntegrationStatus = result.connected
      ? 'CONNECTED'
      : 'CONNECTION_FAILED';

    const failureDetail = result.connected
      ? null
      : `${result.reason}${
          result.httpStatus != null ? ` HTTP ${result.httpStatus}` : ''
        }: ${result.safeReason}`;

    const updated = await this.prisma.butcherDaftraIntegration.update({
      where: { butcherId },
      data: {
        status: nextStatus,
        lastConnectionTestAt: new Date(),
        lastConnectionError: failureDetail,
      },
    });

    await this.appendApplicationComment(adminUserId, butcherId, 'TEST', {
      ok: result.connected,
      reason: result.connected ? 'CONNECTED' : result.reason,
      httpStatus: result.httpStatus,
      host: result.host,
    });

    this.logger.info(
      {
        butcherId,
        adminUserId,
        accountIdentifier: row.accountIdentifier,
        ...daftraConnectionLogFields(result),
      },
      'Daftra connection tested',
    );

    if (result.connected && input.sendInvite) {
      await this.sendInviteEmail(updated, input.invitePassword);
    }

    return {
      status: toPublicStatus(butcherId, updated),
      connected: result.connected,
      reason: result.connected ? undefined : result.reason,
      messageAr: result.connected
        ? 'تم الاتصال بحساب دفترة بنجاح.'
        : `تعذر الاتصال بحساب دفترة. ${result.safeReason}`,
    };
  }

  async disable(
    adminUserId: string,
    butcherId: string,
  ): Promise<DaftraPublicStatus> {
    await this.assertButcherExists(butcherId);
    const row = await this.prisma.butcherDaftraIntegration.findUnique({
      where: { butcherId },
    });
    if (!row) {
      throwApi(400, 'not_configured', 'تكامل دفترة غير معدّ لهذه الملحمة');
    }

    const updated = await this.prisma.butcherDaftraIntegration.update({
      where: { butcherId },
      data: { status: 'DISABLED' },
    });

    await this.appendApplicationComment(adminUserId, butcherId, 'DISABLE', {});
    this.logger.info({ butcherId, adminUserId }, 'Daftra integration disabled');
    return toPublicStatus(butcherId, updated);
  }

  async statusForOwner(user: JwtPayload) {
    const butcherId = await this.requireOwnedButcherId(user);
    return this.getStatus(butcherId);
  }

  async testConnectionForOwner(user: JwtPayload) {
    const butcherId = await this.requireOwnedButcherId(user);
    return this.testConnection(user.userId, butcherId);
  }

  async listProducts(
    butcherId: string,
    query: { page?: number; limit?: number; search?: string } = {},
  ): Promise<DaftraProductPage> {
    const client = await this.clientForButcher(butcherId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      DAFTRA_PRODUCT_PAGE_MAX,
      Math.max(1, query.limit ?? DAFTRA_PRODUCT_PAGE_DEFAULT),
    );
    try {
      const res = await client.get(DAFTRA_PATHS.products, {
        page,
        limit,
        search: query.search,
      });
      return mapDaftraProductPage(res.body);
    } catch (err) {
      this.rethrowDaftra(err);
    }
  }

  async getProduct(
    butcherId: string,
    daftraProductId: number,
  ): Promise<DaftraProduct> {
    const client = await this.clientForButcher(butcherId);
    try {
      const res = await client.get(DAFTRA_PATHS.product(daftraProductId));
      const mapped = mapDaftraProduct(
        (res.body as { data?: unknown }).data ?? res.body,
      );
      if (!mapped) {
        throwApi(404, 'not_found', 'المنتج غير موجود في حساب دفترة');
      }
      return mapped;
    } catch (err) {
      this.rethrowDaftra(err);
    }
  }

  async listInventory(
    butcherId: string,
    query: { page?: number; limit?: number } = {},
  ): Promise<{
    items: DaftraProductStock[];
    page: number;
    pageCount: number;
    totalResults: number;
  }> {
    const page = await this.listProducts(butcherId, query);
    return {
      page: page.page,
      pageCount: page.pageCount,
      totalResults: page.totalResults,
      items: page.items.map((product) => ({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        quantity: product.quantity,
        trackStock: product.trackStock,
        source: 'stock_balance' as const,
        levels: [],
      })),
    };
  }

  async getProductStock(
    butcherId: string,
    daftraProductId: number,
  ): Promise<DaftraProductStock> {
    const client = await this.clientForButcher(butcherId);
    try {
      const res = await client.get(DAFTRA_PATHS.product(daftraProductId));
      const mapped = mapDaftraProductStock(res.body);
      if (!mapped) {
        throwApi(404, 'not_found', 'المخزون غير متاح لهذا المنتج');
      }
      return mapped;
    } catch (err) {
      this.rethrowDaftra(err);
    }
  }

  /**
   * Write helpers for a later butcher-dashboard catalog flow.
   * Not wired to Sarh ButcherProduct CRUD.
   */
  async createRemoteProduct(
    butcherId: string,
    product: Record<string, unknown>,
  ): Promise<DaftraProduct> {
    const client = await this.clientForButcher(butcherId);
    try {
      const res = await client.post(DAFTRA_PATHS.products, {
        Product: product,
      });
      const mapped = mapDaftraProduct(
        (res.body as { data?: unknown }).data ?? res.body,
      );
      if (!mapped) throwApi(502, 'invalid_response', 'استجابة دفترة غير صالحة');
      return mapped;
    } catch (err) {
      this.rethrowDaftra(err);
    }
  }

  async updateRemoteProduct(
    butcherId: string,
    daftraProductId: number,
    product: Record<string, unknown>,
  ): Promise<DaftraProduct> {
    const client = await this.clientForButcher(butcherId);
    try {
      const res = await client.put(DAFTRA_PATHS.product(daftraProductId), {
        Product: product,
      });
      const mapped = mapDaftraProduct(
        (res.body as { data?: unknown }).data ?? res.body,
      );
      if (!mapped) throwApi(502, 'invalid_response', 'استجابة دفترة غير صالحة');
      return mapped;
    } catch (err) {
      this.rethrowDaftra(err);
    }
  }

  async listProductLinks(butcherId: string) {
    await this.assertButcherExists(butcherId);
    return this.prisma.butcherDaftraProduct.findMany({
      take: 500,
      where: { butcherId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async linkProduct(butcherId: string, input: LinkDaftraProductInput) {
    const remote = await this.getProduct(butcherId, input.daftraProductId);
    if (input.sarhProductId) {
      const local = await this.prisma.butcherProduct.findFirst({
        where: {
          id: input.sarhProductId,
          butcherId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!local) {
        throwApi(404, 'product_not_found', 'منتج سرح غير موجود لهذه الملحمة');
      }
    }

    return this.prisma.butcherDaftraProduct.upsert({
      where: {
        butcherId_daftraProductId: {
          butcherId,
          daftraProductId: input.daftraProductId,
        },
      },
      create: {
        butcherId,
        daftraProductId: input.daftraProductId,
        sarhProductId: input.sarhProductId ?? null,
        daftraProductCode: remote.sku,
        daftraSaleUnit: remote.saleUnit,
        lastKnownQuantity: remote.quantity,
        lastSyncedAt: new Date(),
      },
      update: {
        sarhProductId: input.sarhProductId ?? null,
        daftraProductCode: remote.sku,
        daftraSaleUnit: remote.saleUnit,
        lastKnownQuantity: remote.quantity,
        lastSyncedAt: new Date(),
      },
    });
  }

  /** Butchers with a live Daftra link — used by the worker product poll. */
  async listConnectedButcherIds(): Promise<string[]> {
    const rows = await this.prisma.butcherDaftraIntegration.findMany({
      take: 500,
      where: { status: 'CONNECTED' },
      select: { butcherId: true },
    });
    return rows.map((row) => row.butcherId);
  }

  /**
   * Pull Daftra products into Sarh (create/update only).
   * Never auto-deletes Sarh products. External key: (butcherId, daftraProductId).
   */
  async syncProductsFromDaftra(
    adminUserId: string | null,
    butcherId: string,
  ): Promise<DaftraProductSyncResult> {
    await this.assertButcherExists(butcherId);
    const integration = await this.prisma.butcherDaftraIntegration.findUnique({
      where: { butcherId },
    });
    if (!integration || integration.status === 'DISABLED') {
      throwApi(
        400,
        integration?.status === 'DISABLED' ? 'disabled' : 'not_configured',
        integration?.status === 'DISABLED'
          ? 'تكامل دفترة معطّل لهذه الملحمة'
          : 'تكامل دفترة غير معدّ لهذه الملحمة',
      );
    }

    const butcher = await this.prisma.butcher.findUnique({
      where: { id: butcherId },
      select: { id: true, country: true },
    });
    if (!butcher) throwApi(404, 'not_found', 'الملحمة غير موجودة');

    const result: DaftraProductSyncResult = {
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      pages: 0,
      errors: [],
    };

    const pageSize = DAFTRA_PRODUCT_PAGE_MAX;
    let page = 1;
    let pageCount = 1;

    while (page <= pageCount) {
      let remotePage: DaftraProductPage;
      try {
        remotePage = await this.listProducts(butcherId, {
          page,
          limit: pageSize,
        });
      } catch (err) {
        this.logger.warn(
          {
            butcherId,
            page,
            reason: isDaftraRequestError(err) ? err.reason : 'list_failed',
          },
          'Daftra product sync page fetch failed',
        );
        throw err;
      }

      result.pages += 1;
      pageCount = Math.max(1, remotePage.pageCount || 1);
      result.fetched += remotePage.items.length;

      for (const remote of remotePage.items) {
        try {
          const outcome = await this.upsertSyncedProduct(
            butcherId,
            butcher.country,
            remote,
          );
          if (outcome === 'created') result.created += 1;
          else if (outcome === 'updated') result.updated += 1;
          else result.skipped += 1;
        } catch (err) {
          result.skipped += 1;
          result.errors.push({
            daftraProductId: remote.id ?? null,
            message: isDaftraRequestError(err)
              ? err.safeMessage
              : 'تعذر مزامنة المنتج',
          });
          this.logger.warn(
            {
              butcherId,
              daftraProductId: remote.id,
              reason: isDaftraRequestError(err) ? err.reason : 'upsert_failed',
            },
            'Daftra product upsert failed',
          );
        }
      }

      if (remotePage.items.length === 0) break;
      page += 1;
      if (page > 500) break; // hard safety against pagination loops
    }

    await this.appendApplicationComment(
      adminUserId,
      butcherId,
      'PRODUCT_SYNC',
      {
        fetched: result.fetched,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        pages: result.pages,
        errorCount: result.errors.length,
      },
    );

    this.logger.info(
      {
        butcherId,
        adminUserId,
        fetched: result.fetched,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        pages: result.pages,
        errorCount: result.errors.length,
      },
      'Daftra products synced into Sarh',
    );

    return result;
  }

  private async upsertSyncedProduct(
    butcherId: string,
    country: 'SA' | 'AE' | 'KW' | 'QA' | 'BH' | 'OM' | 'EG',
    remote: DaftraProduct,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const fields = mapDaftraProductToSarhFields(remote);
    if (!fields) return 'skipped';

    const existingLink = await this.prisma.butcherDaftraProduct.findUnique({
      where: {
        butcherId_daftraProductId: {
          butcherId,
          daftraProductId: remote.id,
        },
      },
    });

    const now = new Date();

    if (existingLink?.sarhProductId) {
      const local = await this.prisma.butcherProduct.findFirst({
        where: {
          id: existingLink.sarhProductId,
          butcherId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (local) {
        await this.prisma.$transaction([
          this.prisma.butcherProduct.update({
            where: { id: local.id },
            data: {
              nameAr: fields.nameAr,
              nameEn: fields.nameEn,
              priceFixed: fields.priceFixed,
              availableQuantity: fields.availableQuantity,
              inStock: fields.inStock,
              descriptionAr: fields.descriptionAr,
              descriptionEn: fields.descriptionEn,
            },
          }),
          this.prisma.butcherDaftraProduct.update({
            where: { id: existingLink.id },
            data: {
              daftraProductCode: remote.sku,
              daftraSaleUnit: remote.saleUnit,
              lastKnownQuantity: remote.quantity,
              lastSyncedAt: now,
            },
          }),
        ]);
        return 'updated';
      }
    }

    const created = await this.prisma.butcherProduct.create({
      data: {
        butcherId,
        nameAr: fields.nameAr,
        nameEn: fields.nameEn,
        category: fields.category,
        images: fields.images,
        priceFixed: fields.priceFixed,
        pricePerKg: fields.pricePerKg,
        availableCuts: fields.availableCuts,
        availableQuantity: fields.availableQuantity,
        inStock: fields.inStock,
        freshness: fields.freshness,
        descriptionAr: fields.descriptionAr,
        descriptionEn: fields.descriptionEn,
        country,
      },
      select: { id: true },
    });

    await this.prisma.butcherDaftraProduct.upsert({
      where: {
        butcherId_daftraProductId: {
          butcherId,
          daftraProductId: remote.id,
        },
      },
      create: {
        butcherId,
        daftraProductId: remote.id,
        sarhProductId: created.id,
        daftraProductCode: remote.sku,
        daftraSaleUnit: remote.saleUnit,
        lastKnownQuantity: remote.quantity,
        lastSyncedAt: now,
      },
      update: {
        sarhProductId: created.id,
        daftraProductCode: remote.sku,
        daftraSaleUnit: remote.saleUnit,
        lastKnownQuantity: remote.quantity,
        lastSyncedAt: now,
      },
    });

    return 'created';
  }

  async requireOwnedButcherId(user: JwtPayload): Promise<string> {
    const butcher = await this.prisma.butcher.findUnique({
      where: { userId: user.userId },
      select: { id: true },
    });
    if (!butcher) throwApi(403, 'not_butcher', 'هذا الحساب ليس ملحمة');
    return butcher.id;
  }

  /**
   * Authorization Code redirect flow is NOT in Daftra public docs.
   * This endpoint stays for route/Redirect URI parity and returns a clear error.
   * Documented connection methods: API Key (configure/test) or password-grant token.
   */
  async startOAuthForOwner(
    user: JwtPayload,
    _accountIdentifierRaw?: string,
  ): Promise<{ authorizationUrl: string }> {
    await this.requireOwnedButcherId(user);
    const redirectUri =
      readDaftraOAuthEnv().redirectUri || DAFTRA_OAUTH_REDIRECT_URI_DEFAULT;
    this.logger.info(
      { userId: user.userId, redirectUri },
      'Daftra OAuth start rejected — authorization_code not documented',
    );
    throwApi(
      501,
      'oauth_authorization_code_unsupported',
      'دفترة لا توثّق حالياً Authorization Code / Redirect OAuth. اربط الحساب عبر مفتاح API من إعدادات التكامل، أو عبر منحة password الموثّقة على /api2/oauth/token.',
      { redirectUri, documentedMethods: ['api_key', 'password_grant'] },
    );
  }

  /**
   * Callback reserved for registered Redirect URI.
   * Always redirects to failure with unsupported reason — no token exchange.
   */
  async handleOAuthCallback(query: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<{ redirectUrl: string }> {
    const appUrl = (process.env.APP_URL || 'https://sarhsa.online').replace(
      /\/$/,
      '',
    );
    const failureRedirect =
      process.env.DAFTRA_OAUTH_FAILURE_REDIRECT?.trim() ||
      `${appUrl}/butcher/dashboard/products`;
    const url = new URL(failureRedirect);
    url.searchParams.set('daftra_oauth', 'error');
    url.searchParams.set(
      'reason',
      query.error ? 'provider_error' : 'oauth_authorization_code_unsupported',
    );
    this.logger.warn(
      { hasCode: Boolean(query.code), hasState: Boolean(query.state) },
      'Daftra OAuth callback ignored — authorization_code not documented',
    );
    return { redirectUrl: url.toString() };
  }

  /**
   * Documented OAuth2 password grant — stores encrypted tokens; never returns secrets.
   */
  async connectPasswordGrantForOwner(
    user: JwtPayload,
    input: {
      accountIdentifier: string;
      username: string;
      password: string;
    },
  ): Promise<DaftraOAuthStatus> {
    const butcherId = await this.requireOwnedButcherId(user);
    let config;
    try {
      config = assertDaftraOAuthClientConfigured();
    } catch {
      throwApi(
        503,
        'oauth_not_configured',
        'تكامل OAuth لدفترة غير معدّ على الخادم (DAFTRA_CLIENT_ID/SECRET)',
      );
    }

    let accountIdentifier: string;
    try {
      accountIdentifier = assertValidDaftraAccountIdentifier(
        input.accountIdentifier,
      );
    } catch {
      throwApi(400, 'invalid_account', 'معرّف حساب دفترة غير صالح');
    }

    const username = input.username?.trim() ?? '';
    const password = input.password ?? '';
    if (!username || !password) {
      throwApi(400, 'validation_error', 'اسم المستخدم وكلمة المرور مطلوبان');
    }

    let tokens;
    try {
      tokens = await exchangeDaftraPasswordGrant({
        origin: resolveDaftraOrigin(accountIdentifier),
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        username,
        password,
      });
    } catch (err) {
      this.logger.warn(
        {
          butcherId,
          reason: isDaftraRequestError(err)
            ? err.reason
            : 'password_grant_failed',
        },
        'Daftra password grant failed',
      );
      throwApi(
        401,
        'invalid_credentials',
        'تعذر الحصول على رمز دفترة — تحقق من بيانات الدخول',
      );
    }

    const accessEnc = encryptSecret(tokens.accessToken);
    const refreshEnc = tokens.refreshToken
      ? encryptSecret(tokens.refreshToken)
      : null;
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
    const existing = (await this.prisma.butcherDaftraIntegration.findUnique({
      where: { butcherId },
    })) as IntegrationRow | null;

    const authMethod = deriveAuthMethod({
      apiKeyCiphertext: existing?.apiKeyCiphertext ?? null,
      accessTokenCiphertext: accessEnc.ciphertext,
    });

    await this.prisma.butcherDaftraIntegration.upsert({
      where: { butcherId },
      create: {
        butcherId,
        accountIdentifier,
        apiKeyCiphertext: null,
        apiKeyIv: null,
        apiKeyTag: null,
        apiKeyLast4: null,
        authMethod,
        oauthProvider: DAFTRA_OAUTH_PROVIDER,
        accessTokenCiphertext: accessEnc.ciphertext,
        accessTokenIv: accessEnc.iv,
        accessTokenTag: accessEnc.tag,
        refreshTokenCiphertext: refreshEnc?.ciphertext ?? null,
        refreshTokenIv: refreshEnc?.iv ?? null,
        refreshTokenTag: refreshEnc?.tag ?? null,
        accessTokenExpiresAt: expiresAt,
        oauthScopes: tokens.scope,
        oauthConnectedAt: new Date(),
        status: 'CONNECTED',
        lastConnectionTestAt: new Date(),
        lastConnectionError: null,
      },
      update: {
        accountIdentifier,
        authMethod,
        oauthProvider: DAFTRA_OAUTH_PROVIDER,
        accessTokenCiphertext: accessEnc.ciphertext,
        accessTokenIv: accessEnc.iv,
        accessTokenTag: accessEnc.tag,
        refreshTokenCiphertext: refreshEnc?.ciphertext ?? null,
        refreshTokenIv: refreshEnc?.iv ?? null,
        refreshTokenTag: refreshEnc?.tag ?? null,
        accessTokenExpiresAt: expiresAt,
        oauthScopes: tokens.scope,
        oauthConnectedAt: new Date(),
        status: 'CONNECTED',
        lastConnectionTestAt: new Date(),
        lastConnectionError: null,
      },
    });

    // Prove API access with a read-only call (no secrets in logs).
    try {
      const client = await this.clientForButcher(butcherId);
      await probeDaftraConnection(client);
    } catch (err) {
      this.logger.warn(
        {
          butcherId,
          reason: isDaftraRequestError(err) ? err.reason : 'probe_failed',
        },
        'Daftra OAuth connected but probe failed',
      );
    }

    this.logger.info(
      { butcherId, userId: user.userId },
      'Daftra password grant connected',
    );
    return this.oauthStatusForOwner(user);
  }

  async oauthStatusForOwner(user: JwtPayload): Promise<DaftraOAuthStatus> {
    const butcherId = await this.requireOwnedButcherId(user);
    const row = (await this.prisma.butcherDaftraIntegration.findUnique({
      where: { butcherId },
    })) as IntegrationRow | null;
    if (!row || !hasOAuthTokens(row)) {
      return {
        connected: false,
        authenticationMethod: null,
        accountIdentifier: row?.accountIdentifier ?? null,
        expiresAt: null,
        scopes: null,
        provider: null,
      };
    }
    return {
      connected: true,
      authenticationMethod: 'OAUTH',
      accountIdentifier: row.accountIdentifier,
      expiresAt: row.accessTokenExpiresAt?.toISOString() ?? null,
      scopes: row.oauthScopes,
      provider: DAFTRA_OAUTH_PROVIDER,
    };
  }

  async disconnectOAuthForOwner(user: JwtPayload): Promise<DaftraOAuthStatus> {
    const butcherId = await this.requireOwnedButcherId(user);
    const row = (await this.prisma.butcherDaftraIntegration.findUnique({
      where: { butcherId },
    })) as IntegrationRow | null;
    if (!row) {
      throwApi(400, 'not_configured', 'تكامل دفترة غير معدّ لهذه الملحمة');
    }

    const nextStatus: DaftraIntegrationStatus = hasApiKey(row)
      ? row.status === 'DISABLED'
        ? 'DISABLED'
        : 'NOT_CONFIGURED'
      : 'NOT_CONFIGURED';

    await this.prisma.butcherDaftraIntegration.update({
      where: { butcherId },
      data: {
        authMethod: hasApiKey(row) ? 'API_KEY' : 'API_KEY',
        oauthProvider: null,
        accessTokenCiphertext: null,
        accessTokenIv: null,
        accessTokenTag: null,
        refreshTokenCiphertext: null,
        refreshTokenIv: null,
        refreshTokenTag: null,
        accessTokenExpiresAt: null,
        oauthScopes: null,
        oauthConnectedAt: null,
        status: nextStatus,
        lastConnectionError: null,
      },
    });

    this.logger.info(
      { butcherId, userId: user.userId },
      'Daftra OAuth disconnected',
    );
    return this.oauthStatusForOwner(user);
  }

  private async clientForButcher(butcherId: string): Promise<DaftraClient> {
    await this.assertButcherExists(butcherId);
    const row = (await this.prisma.butcherDaftraIntegration.findUnique({
      where: { butcherId },
    })) as IntegrationRow | null;
    if (!row || (!hasApiKey(row) && !hasOAuthTokens(row))) {
      throwApi(400, 'not_configured', 'تكامل دفترة غير معدّ لهذه الملحمة');
    }
    if (row.status === 'DISABLED') {
      throwApi(409, 'disabled', 'تكامل دفترة معطّل لهذه الملحمة');
    }

    if (hasOAuthTokens(row)) {
      return this.clientFromOAuthRow(row);
    }

    try {
      const apiKey = decryptSecret({
        ciphertext: row.apiKeyCiphertext!,
        iv: row.apiKeyIv!,
        tag: row.apiKeyTag!,
      }).trim();
      return createDaftraClient({
        accountIdentifier: row.accountIdentifier,
        apiKey,
      });
    } catch {
      this.logger.warn({ butcherId }, 'Daftra API key decrypt failed');
      throwApi(500, 'decrypt_failed', 'تعذر قراءة إعدادات التكامل');
    }
  }

  private async clientFromOAuthRow(row: IntegrationRow): Promise<DaftraClient> {
    let accessToken: string;
    try {
      accessToken = decryptSecret({
        ciphertext: row.accessTokenCiphertext!,
        iv: row.accessTokenIv!,
        tag: row.accessTokenTag!,
      }).trim();
    } catch {
      this.logger.warn(
        { butcherId: row.butcherId },
        'Daftra OAuth access token decrypt failed',
      );
      throwApi(500, 'decrypt_failed', 'تعذر قراءة إعدادات التكامل');
    }

    const expiresSoon =
      row.accessTokenExpiresAt != null &&
      row.accessTokenExpiresAt.getTime() <= Date.now() + 60_000;

    if (expiresSoon && row.refreshTokenCiphertext) {
      const refreshed = await this.refreshAndPersist(row);
      if (refreshed) accessToken = refreshed;
    }

    return createDaftraOAuthClient({
      accountIdentifier: row.accountIdentifier,
      accessToken,
      refreshAccessToken: async () => this.refreshAndPersist(row),
    });
  }

  private async refreshAndPersist(row: IntegrationRow): Promise<string | null> {
    if (
      !row.refreshTokenCiphertext ||
      !row.refreshTokenIv ||
      !row.refreshTokenTag
    ) {
      return null;
    }
    let config;
    try {
      config = assertDaftraOAuthClientConfigured();
    } catch {
      return null;
    }
    let refreshToken: string;
    try {
      refreshToken = decryptSecret({
        ciphertext: row.refreshTokenCiphertext,
        iv: row.refreshTokenIv,
        tag: row.refreshTokenTag,
      }).trim();
    } catch {
      this.logger.warn(
        { butcherId: row.butcherId },
        'Daftra OAuth refresh token decrypt failed',
      );
      return null;
    }

    try {
      const tokens = await refreshDaftraAccessToken({
        origin: resolveDaftraOrigin(row.accountIdentifier),
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken,
      });
      const accessEnc = encryptSecret(tokens.accessToken);
      const refreshEnc = tokens.refreshToken
        ? encryptSecret(tokens.refreshToken)
        : null;
      const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
      await this.prisma.butcherDaftraIntegration.update({
        where: { butcherId: row.butcherId },
        data: {
          accessTokenCiphertext: accessEnc.ciphertext,
          accessTokenIv: accessEnc.iv,
          accessTokenTag: accessEnc.tag,
          ...(refreshEnc
            ? {
                refreshTokenCiphertext: refreshEnc.ciphertext,
                refreshTokenIv: refreshEnc.iv,
                refreshTokenTag: refreshEnc.tag,
              }
            : {}),
          accessTokenExpiresAt: expiresAt,
          lastConnectionError: null,
        },
      });
      row.accessTokenCiphertext = accessEnc.ciphertext;
      row.accessTokenIv = accessEnc.iv;
      row.accessTokenTag = accessEnc.tag;
      row.accessTokenExpiresAt = expiresAt;
      return tokens.accessToken;
    } catch (err) {
      this.logger.warn(
        {
          butcherId: row.butcherId,
          reason: isDaftraRequestError(err) ? err.reason : 'refresh_failed',
        },
        'Daftra OAuth refresh failed',
      );
      return null;
    }
  }

  private rethrowDaftra(err: unknown): never {
    if (isDaftraRequestError(err)) {
      const status =
        err.reason === 'INVALID_API_KEY'
          ? 401
          : err.reason === 'NOT_FOUND'
            ? 404
            : err.reason === 'RATE_LIMITED'
              ? 429
              : 502;
      throwApi(status, err.reason.toLowerCase(), err.safeMessage);
    }
    throw err;
  }

  private async assertButcherExists(butcherId: string): Promise<void> {
    const butcher = await this.prisma.butcher.findUnique({
      where: { id: butcherId },
      select: { id: true },
    });
    if (!butcher) throwApi(404, 'not_found', 'الملحمة غير موجودة');
  }

  private async appendApplicationComment(
    adminUserId: string | null,
    butcherId: string,
    kind: 'CONFIGURE' | 'TEST' | 'DISABLE' | 'PRODUCT_SYNC',
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const butcher = await this.prisma.butcher.findUnique({
      where: { id: butcherId },
      select: { sourceApplicationId: true },
    });
    if (!butcher?.sourceApplicationId) return;
    try {
      await this.prisma.$transaction(async (tx) => {
        await appendTimelineEvent(tx, {
          applicationId: butcher.sourceApplicationId!,
          action: 'COMMENT',
          createdBy: adminUserId,
          comment: `daftra_${kind.toLowerCase()}`,
          metadata: {
            kind: `DAFTRA_${kind}`,
            ...(adminUserId ? {} : { automated: true }),
            ...metadata,
          },
        });
      });
    } catch (err) {
      this.logger.warn(
        {
          err: err instanceof Error ? err.message : 'timeline_failed',
          butcherId,
        },
        'Daftra timeline comment failed',
      );
    }
  }

  private async sendInviteEmail(
    row: {
      daftraLoginEmail: string | null;
      daftraLoginUrl: string | null;
      butcherId: string;
    },
    invitePassword?: string,
  ): Promise<void> {
    const to = row.daftraLoginEmail?.trim();
    const loginUrl = row.daftraLoginUrl?.trim();
    if (!to || !loginUrl) {
      this.logger.info(
        { butcherId: row.butcherId },
        'Daftra invite skipped — login email/url missing',
      );
      return;
    }

    const passwordLine = invitePassword?.trim()
      ? `\nكلمة المرور المؤقتة: ${invitePassword.trim()}\nيُفضّل تغييرها بعد أول دخول.`
      : '';

    await this.emailQueue.addEmail({
      to,
      subject: 'تم تجهيز حساب دفترة لمنصة سرح',
      template: 'butcher_daftra_ready',
      variables: {
        loginUrl,
        loginEmail: to,
        passwordLine,
      },
    });
  }
}
