import { Test, TestingModule } from '@nestjs/testing';
import { HealthService, HealthRepository } from './health.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import { RedisSessionService } from '../redis/services/redis-session.service';
import { NotificationQueueService } from '../queue/services/notification-queue.service';

describe('HealthService', () => {
  let health: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        HealthRepository,
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockResolvedValue(1) },
        },
        {
          provide: RedisCacheService,
          useValue: {
            isEnabled: () => false,
            ping: jest.fn(),
            getClient: jest.fn(),
          },
        },
        {
          provide: RedisSessionService,
          useValue: { ping: jest.fn() },
        },
        {
          provide: NotificationQueueService,
          useValue: { isEnabled: () => false, getJobCounts: jest.fn() },
        },
      ],
    }).compile();

    health = module.get<HealthService>(HealthService);
  });

  it('returns ok when database is reachable', async () => {
    const result = await health.check();
    expect(result.status).toBe('ok');
    expect(result.checks.db).toBe(true);
  });

  it('reports ready when redis is disabled and db is up', async () => {
    const result = await health.ready();
    expect(result.status).toBe('ready');
    expect(result.httpStatus).toBe(200);
  });
});
