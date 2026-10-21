import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { UsersController } from './users.controller';
import { UsersService } from './services/users.service';
import { UserReviewsService } from './services/user-reviews.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

describe('UsersController routes', () => {
  let app: INestApplication;
  const usersService = {
    setBlock: jest.fn().mockResolvedValue({ blocked: true }),
    listBlocked: jest.fn().mockResolvedValue({ users: [] }),
  };
  const reviewsService = {
    list: jest
      .fn()
      .mockResolvedValue({ reviews: [], positiveCount: 0, negativeCount: 0 }),
    create: jest
      .fn()
      .mockResolvedValue({ created: true, rating: 5, reviewCount: 1 }),
    report: jest.fn().mockResolvedValue({ id: 'ticket-1' }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: UserReviewsService, useValue: reviewsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { userId: 'viewer-1', role: 'USER' };
          return true;
        },
      })
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(
      (
        req: { user?: { userId: string; role: string } },
        _res: unknown,
        next: () => void,
      ) => {
        req.user = { userId: 'viewer-1', role: 'USER' };
        next();
      },
    );
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/users/:id/block → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/users/target-1/block')
      .send({ blocked: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.blocked).toBe(true);
    expect(usersService.setBlock).toHaveBeenCalledWith(
      'target-1',
      'viewer-1',
      true,
    );
  });

  it('GET /api/users/blocked → 200', async () => {
    const res = await request(app.getHttpServer()).get('/api/users/blocked');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  const reviewBody = {
    rating: 5,
    purchased: true,
    recommend: false,
    comment: 'لم أنصح بالتعامل',
    oathAccepted: true,
  };

  it('POST /api/users/:id/reviews creates once', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/users/target-1/reviews')
      .send(reviewBody);
    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(true);
    expect(reviewsService.create).toHaveBeenCalledWith(
      'target-1',
      'viewer-1',
      expect.objectContaining(reviewBody),
    );
  });

  it('POST /api/users/:id/reviews rejects a missing oath, empty comment, and overlong comment', async () => {
    const before = reviewsService.create.mock.calls.length;
    const missingOath = await request(app.getHttpServer())
      .post('/api/users/target-1/reviews')
      .send({ ...reviewBody, oathAccepted: false });
    expect(missingOath.status).toBe(400);

    const empty = await request(app.getHttpServer())
      .post('/api/users/target-1/reviews')
      .send({ ...reviewBody, comment: '   ' });
    expect(empty.status).toBe(400);

    const long = await request(app.getHttpServer())
      .post('/api/users/target-1/reviews')
      .send({ ...reviewBody, comment: 'ا'.repeat(1001) });
    expect(long.status).toBe(400);
    expect(reviewsService.create).toHaveBeenCalledTimes(before);
  });

  it('GET /api/users/:id/reviews is listed with cursor pagination inputs', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/users/target-1/reviews?limit=2',
    );
    expect(res.status).toBe(200);
    expect(reviewsService.list).toHaveBeenCalledWith(
      'target-1',
      expect.objectContaining({ limit: 2 }),
      expect.objectContaining({ userId: 'viewer-1' }),
    );
  });

  it('does not expose edit, delete, or the old upsert rate route', async () => {
    const patch = await request(app.getHttpServer())
      .patch('/api/users/target-1/reviews/rev-1')
      .send(reviewBody);
    const del = await request(app.getHttpServer()).delete(
      '/api/users/target-1/reviews/rev-1',
    );
    const legacy = await request(app.getHttpServer())
      .post('/api/users/target-1/rate')
      .send({ rating: 5 });
    expect(patch.status).toBe(404);
    expect(del.status).toBe(404);
    expect(legacy.status).toBe(404);
  });
});
