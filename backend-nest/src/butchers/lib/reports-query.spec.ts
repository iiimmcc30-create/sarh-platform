import {
  isoWeekKeyFromDay,
  parseReportsQuery,
  riyadhCalendarDay,
} from './reports-query';

describe('parseReportsQuery', () => {
  const now = new Date('2026-08-19T12:00:00.000+03:00');

  it('defaults to last 30 days', () => {
    const parsed = parseReportsQuery({}, now);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.query.period).toBe('30d');
    expect(parsed.query.to.getTime()).toBe(now.getTime());
  });

  it('requires from/to for custom period', () => {
    const parsed = parseReportsQuery({ period: 'custom' }, now);
    expect(parsed.ok).toBe(false);
  });

  it('parses a custom Riyadh day range', () => {
    const parsed = parseReportsQuery(
      { period: 'custom', from: '2026-08-01', to: '2026-08-10' },
      now,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.query.from.toISOString()).toBe(
      new Date('2026-08-01T00:00:00.000+03:00').toISOString(),
    );
    expect(parsed.query.to.toISOString()).toBe(
      new Date('2026-08-10T23:59:59.999+03:00').toISOString(),
    );
  });
});

describe('riyadh calendar helpers', () => {
  it('formats a Riyadh calendar day', () => {
    expect(riyadhCalendarDay(new Date('2026-08-19T01:00:00.000Z'))).toBe(
      '2026-08-19',
    );
  });

  it('computes an ISO week key from that day', () => {
    expect(isoWeekKeyFromDay('2026-08-19')).toBe('2026-W34');
  });
});
