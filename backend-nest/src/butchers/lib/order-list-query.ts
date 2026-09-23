import { OrderStatus, Prisma } from '@prisma/client';

const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'delivered',
  'cancelled',
];

export type OrderListQuery = {
  paged: boolean;
  page: number;
  limit: number;
  status?: OrderStatus;
  search?: string;
  from?: Date;
  to?: Date;
};

function parseDateBound(
  value: string | undefined,
  endOfDay: boolean,
): Date | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(
      endOfDay
        ? `${trimmed}T23:59:59.999+03:00`
        : `${trimmed}T00:00:00.000+03:00`,
    );
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function firstString(
  raw: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = raw[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0].trim();
  }
  return undefined;
}

/** `butcherId` from the client is ignored — callers must scope by JWT. */
export function parseOrderListQuery(
  raw: Record<string, unknown>,
): { ok: true; query: OrderListQuery } | { ok: false; message: string } {
  const pageRaw = firstString(raw, 'page');
  const limitRaw = firstString(raw, 'limit');
  const statusRaw = firstString(raw, 'status');
  const search = firstString(raw, 'q') ?? firstString(raw, 'search');
  const fromRaw = firstString(raw, 'from');
  const toRaw = firstString(raw, 'to');

  const paged = Boolean(
    pageRaw || limitRaw || statusRaw || search || fromRaw || toRaw,
  );

  let page = 1;
  if (pageRaw) {
    page = Number.parseInt(pageRaw, 10);
    if (!Number.isFinite(page) || page < 1) {
      return { ok: false, message: 'رقم الصفحة غير صالح' };
    }
  }

  let limit = 20;
  if (limitRaw) {
    limit = Number.parseInt(limitRaw, 10);
    if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
      return { ok: false, message: 'حد النتائج غير صالح' };
    }
  }

  let status: OrderStatus | undefined;
  if (statusRaw) {
    if (!ORDER_STATUSES.includes(statusRaw as OrderStatus)) {
      return { ok: false, message: 'حالة الطلب غير صالحة' };
    }
    status = statusRaw as OrderStatus;
  }

  const from = parseDateBound(fromRaw, false);
  if (fromRaw && !from) return { ok: false, message: 'تاريخ البداية غير صالح' };
  const to = parseDateBound(toRaw, true);
  if (toRaw && !to) return { ok: false, message: 'تاريخ النهاية غير صالح' };

  return {
    ok: true,
    query: {
      paged,
      page,
      limit,
      status,
      search: search?.slice(0, 80),
      from,
      to,
    },
  };
}

export function buildOrderListWhere(params: {
  butcherId?: string;
  customerId?: string;
  status?: OrderStatus;
  search?: string;
  from?: Date;
  to?: Date;
}): Prisma.ButcherOrderWhereInput {
  const where: Prisma.ButcherOrderWhereInput = {};
  if (params.butcherId) where.butcherId = params.butcherId;
  if (params.customerId) where.customerId = params.customerId;
  if (params.status) where.status = params.status;
  if (params.from || params.to) {
    where.createdAt = {
      ...(params.from ? { gte: params.from } : {}),
      ...(params.to ? { lte: params.to } : {}),
    };
  }
  if (params.search) {
    where.OR = [
      { orderNumber: { contains: params.search, mode: 'insensitive' } },
      {
        customer: {
          OR: [
            { arabicName: { contains: params.search, mode: 'insensitive' } },
            { displayName: { contains: params.search, mode: 'insensitive' } },
            { phone: { contains: params.search } },
          ],
        },
      },
    ];
  }
  return where;
}

export function startOfTodayRiyadh(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${parts}T00:00:00.000+03:00`);
}
