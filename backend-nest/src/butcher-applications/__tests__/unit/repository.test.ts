import {
  adminOrderBy,
  buildAdminApplicationWhere,
} from '../../repositories/application.repository';

describe('application repository query builders', () => {
  describe('adminOrderBy', () => {
    it('defaults to submittedAt_desc', () => {
      expect(adminOrderBy()).toEqual([{ submittedAt: 'desc' }, { id: 'desc' }]);
    });

    it('supports createdAt_desc and updatedAt_desc', () => {
      expect(adminOrderBy('createdAt_desc')[0]).toEqual({ createdAt: 'desc' });
      expect(adminOrderBy('updatedAt_desc')[0]).toEqual({ updatedAt: 'desc' });
    });
  });

  describe('buildAdminApplicationWhere', () => {
    it('filters by status and country', () => {
      expect(
        buildAdminApplicationWhere({ status: 'SUBMITTED', country: 'SA' }),
      ).toEqual({
        status: 'SUBMITTED',
        country: 'SA',
      });
    });

    it('builds submittedAt range', () => {
      const from = new Date('2025-01-01');
      const to = new Date('2025-06-01');
      expect(
        buildAdminApplicationWhere({ submittedFrom: from, submittedTo: to }),
      ).toEqual({
        submittedAt: { gte: from, lte: to },
      });
    });

    it('builds search OR clause', () => {
      const where = buildAdminApplicationWhere({ search: 'safat' });
      expect(where.OR).toBeDefined();
      expect(where.OR?.length).toBeGreaterThan(0);
    });

    it('includes application number in search when numeric', () => {
      const where = buildAdminApplicationWhere({ search: '42' });
      expect(where.OR).toEqual(
        expect.arrayContaining([{ applicationNumber: 42 }]),
      );
    });
  });
});
