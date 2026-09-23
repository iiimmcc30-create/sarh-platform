import { startOfTodayRiyadh } from './order-list-query';

export type ReportsPeriod = 'today' | '7d' | '30d' | 'custom';

export type ReportsQuery = {
  period: ReportsPeriod;
  from: Date;
  to: Date;
};

function firstString(
  raw: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = raw[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function parseDay(value: string, endOfDay: boolean): Date | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(
      endOfDay ? `${value}T23:59:59.999+03:00` : `${value}T00:00:00.000+03:00`,
    );
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function parseReportsQuery(
  raw: Record<string, unknown>,
  now = new Date(),
): { ok: true; query: ReportsQuery } | { ok: false; message: string } {
  const periodRaw = firstString(raw, 'period') ?? '30d';
  const allowed: ReportsPeriod[] = ['today', '7d', '30d', 'custom'];
  if (!allowed.includes(periodRaw as ReportsPeriod)) {
    return { ok: false, message: 'فترة التقرير غير صالحة' };
  }
  const period = periodRaw as ReportsPeriod;
  const today = startOfTodayRiyadh(now);

  if (period === 'today') {
    return { ok: true, query: { period, from: today, to: now } };
  }
  if (period === '7d') {
    return {
      ok: true,
      query: {
        period,
        from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        to: now,
      },
    };
  }
  if (period === '30d') {
    return {
      ok: true,
      query: {
        period,
        from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        to: now,
      },
    };
  }

  const fromRaw = firstString(raw, 'from');
  const toRaw = firstString(raw, 'to');
  if (!fromRaw || !toRaw) {
    return { ok: false, message: 'الفترة المخصصة تحتاج تاريخ بداية ونهاية' };
  }
  const from = parseDay(fromRaw, false);
  const to = parseDay(toRaw, true);
  if (!from || !to) return { ok: false, message: 'تاريخ غير صالح' };
  if (from > to) return { ok: false, message: 'تاريخ البداية بعد النهاية' };
  return { ok: true, query: { period, from, to } };
}

export function riyadhCalendarDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** ISO week key from a YYYY-MM-DD calendar day (Riyadh). */
export function isoWeekKeyFromDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
