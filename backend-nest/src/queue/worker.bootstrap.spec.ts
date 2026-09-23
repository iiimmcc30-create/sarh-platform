import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Documents the worker bootstrap contract: heartbeat must be started explicitly
 * because Nest ApplicationContext does not instantiate unused providers.
 */
describe('worker bootstrap heartbeat contract', () => {
  it('worker.main retrieves WorkerHeartbeatService and calls start()', () => {
    const src = readFileSync(join(__dirname, 'worker.main.ts'), 'utf8');
    expect(src).toContain('WorkerHeartbeatService');
    expect(src).toMatch(/get\(WorkerHeartbeatService\)\.start\(\)/);
    // Redis connect happens before heartbeat start so the first beat can write.
    const redisIdx = src.indexOf('RedisCacheService');
    const heartbeatIdx = src.indexOf('WorkerHeartbeatService).start');
    expect(redisIdx).toBeGreaterThan(-1);
    expect(heartbeatIdx).toBeGreaterThan(redisIdx);
  });
});
