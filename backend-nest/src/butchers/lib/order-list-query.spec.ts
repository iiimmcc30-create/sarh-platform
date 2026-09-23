import { buildOrderListWhere, parseOrderListQuery } from './order-list-query';

describe('parseOrderListQuery', () => {
  it('keeps the legacy unpaged contract when no list params are sent', () => {
    const parsed = parseOrderListQuery({ butcherId: 'attacker-shop' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.query.paged).toBe(false);
  });

  it('enables paging when page is present and ignores butcherId', () => {
    const parsed = parseOrderListQuery({
      page: '2',
      limit: '10',
      butcherId: 'other-butcher',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.query.paged).toBe(true);
    expect(parsed.query.page).toBe(2);
    expect(parsed.query.limit).toBe(10);
  });

  it('rejects unknown order statuses', () => {
    const parsed = parseOrderListQuery({ status: 'accepted' });
    expect(parsed.ok).toBe(false);
  });
});

describe('buildOrderListWhere', () => {
  it('scopes by butcherId from the server, not a second client id', () => {
    const where = buildOrderListWhere({
      butcherId: 'butcher-a',
      status: 'pending',
    });
    expect(where.butcherId).toBe('butcher-a');
    expect(where.status).toBe('pending');
  });
});
