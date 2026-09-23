import {
  isPrismaUniqueConflict,
  notificationRowIdFromQueueJob,
} from './notification-idempotency';

describe('notification row idempotency (M10)', () => {
  it('maps the same queue job id to the same notification id', () => {
    const a = notificationRowIdFromQueueJob('job-1');
    const b = notificationRowIdFromQueueJob('job-1');
    expect(a).toBe(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('does not merge different jobs / different notifications', () => {
    expect(notificationRowIdFromQueueJob('job-like')).not.toBe(
      notificationRowIdFromQueueJob('job-comment'),
    );
  });

  it('detects Prisma unique conflicts from retries', () => {
    expect(isPrismaUniqueConflict({ code: 'P2002' })).toBe(true);
    expect(isPrismaUniqueConflict({ code: 'P2001' })).toBe(false);
    expect(isPrismaUniqueConflict(new Error('fail'))).toBe(false);
  });
});
