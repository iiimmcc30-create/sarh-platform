import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { UsersController } from './users.controller';
import { UsersService } from './services/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

describe('UsersController routes', () => {
  let app: INestApplication;
  const usersService = {
    setBlock: jest.fn().mockResolvedValue({ blocked: true }),
    listBlocked: jest.fn().mockResolvedValue({ users: [] }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
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
});
