import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { UserReviewsController } from './user-reviews.controller';
import { UserReviewsService } from './user-reviews.service';

describe('UserReviewsController', () => {
  let app: INestApplication;
  const reviews = {
    create: jest
      .fn()
      .mockResolvedValue({ review: { id: 'rev-1' }, reviewCount: 1 }),
    list: jest.fn().mockResolvedValue({ reviews: [], reviewCount: 0 }),
    report: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UserReviewsController],
      providers: [{ provide: UserReviewsService, useValue: reviews }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          ctx.switchToHttp().getRequest().user = {
            userId: 'buyer',
            role: 'USER',
          };
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
        req.user = { userId: 'buyer', role: 'USER' };
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

  const body = {
    rating: 5,
    purchased: true,
    recommend: true,
    comment: 'تجربة جيدة',
    oathAccepted: true,
  };

  it('POST creates a review only when the oath and comment are present', async () => {
    const ok = await request(app.getHttpServer())
      .post('/api/users/seller/reviews')
      .send(body);
    expect(ok.status).toBe(201);
    expect(reviews.create).toHaveBeenCalledWith(
      'seller',
      'buyer',
      expect.objectContaining({
        comment: 'تجربة جيدة',
        oathAccepted: true,
        rating: 5,
      }),
    );

    const missingOath = await request(app.getHttpServer())
      .post('/api/users/seller/reviews')
      .send({ ...body, oathAccepted: false });
    expect(missingOath.status).toBe(400);

    const empty = await request(app.getHttpServer())
      .post('/api/users/seller/reviews')
      .send({ ...body, comment: '   ' });
    expect(empty.status).toBe(400);
  });

  it('GET lists reviews', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/users/seller/reviews?limit=2',
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(reviews.list).toHaveBeenCalled();
  });
});
