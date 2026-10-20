import { readFileSync } from 'fs';
import { join } from 'path';
import { AdminService } from './admin.service';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

const actor: JwtPayload = {
  userId: 'admin-1',
  username: 'admin',
  role: 'ADMIN',
};

function makeService() {
  const repo = {
    findTicket: jest.fn(),
    hideReview: jest.fn(),
    findReview: jest.fn(),
    listReviews: jest.fn(),
    listReviewReportTickets: jest.fn(),
  };
  const cache = { del: jest.fn().mockResolvedValue(1) };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new AdminService(
    repo as never,
    {} as never,
    {} as never,
    {} as never,
    logger as never,
    cache as never,
  );
  return { service, repo, cache };
}

describe('AdminService.hideReview', () => {
  it('hides through a matching report and writes no delete', async () => {
    const { service, repo, cache } = makeService();
    repo.findTicket.mockResolvedValue({
      id: 'ticket-1',
      type: 'REPORT',
      deletedAt: null,
      metadata: { targetType: 'review', targetId: 'rev-1' },
    });
    repo.hideReview.mockResolvedValue({
      alreadyHidden: false,
      review: { id: 'rev-1', targetId: 'seller-1', hiddenAt: new Date() },
      action: { id: 'act-1', action: 'hide_user_review' },
    });

    const result = await service.hideReview('rev-1', actor, {
      reason: 'تعليق مسيء',
      reportId: '6d5f4c2a-1b2c-4d3e-8f90-aabbccddeeff',
    });

    expect(repo.hideReview).toHaveBeenCalledWith({
      reviewId: 'rev-1',
      actorId: 'admin-1',
      reason: 'تعليق مسيء',
      reportId: '6d5f4c2a-1b2c-4d3e-8f90-aabbccddeeff',
    });
    expect(cache.del).toHaveBeenCalledWith(
      'user:seller-1',
      'user:seller-1:base',
    );
    expect(result.hidden).toBe(true);
    expect(repo).not.toHaveProperty('deleteReview');
  });

  it('rejects a hide that is not tied to that review report', async () => {
    const { service, repo } = makeService();
    repo.findTicket.mockResolvedValue({
      id: 'ticket-1',
      type: 'REPORT',
      deletedAt: null,
      metadata: { targetType: 'post', targetId: 'rev-1' },
    });
    await expect(
      service.hideReview('rev-1', actor, {
        reason: 'تعليق مسيء',
        reportId: '6d5f4c2a-1b2c-4d3e-8f90-aabbccddeeff',
      }),
    ).rejects.toMatchObject({ status: 400, error: 'validation_error' });
    expect(repo.hideReview).not.toHaveBeenCalled();
  });

  it('requires a reason', async () => {
    const { service, repo } = makeService();
    await expect(
      service.hideReview('rev-1', actor, {
        reason: 'لا',
        reportId: '6d5f4c2a-1b2c-4d3e-8f90-aabbccddeeff',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.findTicket).not.toHaveBeenCalled();
  });
});

describe('review moderation source', () => {
  const controller = readFileSync(
    join(__dirname, 'admin.controller.ts'),
    'utf8',
  );
  const repository = readFileSync(
    join(__dirname, 'repositories/admin.repository.ts'),
    'utf8',
  );
  const migration = readFileSync(
    join(
      __dirname,
      '../../prisma/migrations/20261020140000_user_review_comments/migration.sql',
    ),
    'utf8',
  );

  it('exposes hide and does not register a review delete route', () => {
    expect(controller).toContain("@Post('reviews/:id/hide')");
    expect(controller).not.toMatch(/@Delete\('reviews/);
  });

  it('hide update touches only moderation columns', () => {
    const hide = repository.slice(repository.indexOf('async hideReview'));
    const update = hide.slice(hide.indexOf('userReview.update'));
    const data = update.slice(
      update.indexOf('data:'),
      update.indexOf('select:'),
    );
    expect(data).toContain('hiddenAt');
    expect(data).toContain('hiddenReason');
    expect(data).toContain('hiddenById');
    expect(data).not.toContain('comment:');
    expect(data).not.toContain('rating:');
    expect(repository).not.toContain('userReview.delete');
  });

  it('migration preserves rows and blocks delete plus content edits', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "comment"');
    expect(migration).toContain("DEFAULT ''");
    expect(migration).toContain('user reviews cannot be deleted');
    expect(migration).toContain('user review content is immutable');
    expect(migration).toContain('SET "recommend" = true');
    expect(migration).toContain('rating >= 4');
    expect(migration).toContain('rating <= 3');
    const backfill = migration.indexOf('SET "recommend" = true');
    const dropGuard = migration.indexOf(
      'DROP TRIGGER IF EXISTS user_review_guard_immutable',
    );
    const createGuard = migration.indexOf(
      'CREATE TRIGGER user_review_guard_immutable',
    );
    expect(dropGuard).toBeGreaterThanOrEqual(0);
    expect(backfill).toBeGreaterThan(dropGuard);
    expect(createGuard).toBeGreaterThan(backfill);
    expect(migration).not.toContain('DROP TABLE');
    expect(migration).not.toContain('DELETE FROM "UserReview"');
  });
});
