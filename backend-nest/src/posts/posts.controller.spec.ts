import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

describe('PostsController comment routes', () => {
  let app: INestApplication;
  const postsService = {
    listComments: jest.fn().mockResolvedValue({ comments: [] }),
    createComment: jest.fn(),
    deleteComment: jest.fn().mockResolvedValue({ deleted: true }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [{ provide: PostsService, useValue: postsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { userId: 'author-1', role: 'USER' };
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
        req.user = { userId: 'author-1', role: 'USER' };
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

  it('DELETE /api/posts/:id/comments/:commentId → 200', async () => {
    const res = await request(app.getHttpServer()).delete(
      '/api/posts/post-1/comments/comment-1',
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deleted).toBe(true);
    expect(postsService.deleteComment).toHaveBeenCalledWith(
      { userId: 'author-1', role: 'USER' },
      'post-1',
      'comment-1',
    );
  });
});
