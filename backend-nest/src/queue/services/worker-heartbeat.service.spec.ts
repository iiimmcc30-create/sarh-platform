import {
  HEARTBEAT_TTL_SEC,
  readWorkerHeartbeat,
  WORKER_HEARTBEAT_KEY,
  WorkerHeartbeatService,
} from './worker-heartbeat.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { LoggerService } from '../../common/services/logger.service';

describe('readWorkerHeartbeat', () => {
  it('returns true when heartbeat key is fresh', async () => {
    const client = {
      status: 'ready',
      get: jest
        .fn()
        .mockResolvedValue(JSON.stringify({ ts: Date.now(), pid: 1 })),
    };
    const cache = {
      isEnabled: () => true,
      getClient: () => client,
    } as unknown as RedisCacheService;

    await expect(readWorkerHeartbeat(cache)).resolves.toBe(true);
    expect(client.get).toHaveBeenCalledWith(WORKER_HEARTBEAT_KEY);
  });

  it('returns false when heartbeat key is missing', async () => {
    const client = {
      status: 'ready',
      get: jest.fn().mockResolvedValue(null),
    };
    const cache = {
      isEnabled: () => true,
      getClient: () => client,
    } as unknown as RedisCacheService;

    await expect(readWorkerHeartbeat(cache)).resolves.toBe(false);
  });

  it('returns false when redis is disabled', async () => {
    const cache = {
      isEnabled: () => false,
      getClient: jest.fn(),
    } as unknown as RedisCacheService;

    await expect(readWorkerHeartbeat(cache)).resolves.toBe(false);
  });
});

describe('WorkerHeartbeatService', () => {
  function makeService(client: {
    status: string;
    set: jest.Mock;
    connect?: jest.Mock;
  }) {
    const info = jest.fn();
    const warn = jest.fn();
    const cache = {
      isEnabled: () => true,
      getClient: () => client,
    } as unknown as RedisCacheService;
    const logger = {
      info,
      warn,
      error: jest.fn(),
    } as unknown as LoggerService;
    return {
      service: new WorkerHeartbeatService(cache, logger),
      info,
      warn,
    };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('beat writes sarh:worker:heartbeat with TTL longer than interval', async () => {
    const set = jest.fn().mockResolvedValue('OK');
    const { service } = makeService({ status: 'ready', set });

    await expect(service.beat()).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith(
      WORKER_HEARTBEAT_KEY,
      expect.stringContaining('"pid"'),
      'EX',
      HEARTBEAT_TTL_SEC,
    );
    expect(HEARTBEAT_TTL_SEC).toBeGreaterThan(30);
  });

  it('start runs an immediate beat and schedules interval', async () => {
    jest.useFakeTimers();
    const set = jest.fn().mockResolvedValue('OK');
    const { service, info } = makeService({ status: 'ready', set });

    service.start();
    await Promise.resolve();
    expect(set).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ ttlSec: HEARTBEAT_TTL_SEC }),
      'Worker heartbeat started',
    );

    await jest.advanceTimersByTimeAsync(30_000);
    expect(set).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
  });

  it('start is idempotent', async () => {
    jest.useFakeTimers();
    const set = jest.fn().mockResolvedValue('OK');
    const { service } = makeService({ status: 'ready', set });

    service.start();
    service.start();
    await Promise.resolve();
    expect(set).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });

  it('beat connects when Redis status is wait', async () => {
    const set = jest.fn().mockResolvedValue('OK');
    const connect = jest.fn().mockImplementation(async () => {
      client.status = 'ready';
    });
    const client = { status: 'wait', set, connect };
    const { service } = makeService(client);

    await expect(service.beat()).resolves.toBe(true);
    expect(connect).toHaveBeenCalled();
    expect(set).toHaveBeenCalled();
  });
});
