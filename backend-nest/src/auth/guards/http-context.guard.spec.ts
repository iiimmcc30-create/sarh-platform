import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RequestIdInterceptor } from '../../common/interceptors/request-id.interceptor';

function wsContext(): ExecutionContext {
  return {
    getType: () => 'ws',
    getHandler: () => function handler() {},
    getClass: () => class Gateway {},
  } as unknown as ExecutionContext;
}

describe('HTTP guards on the socket process', () => {
  it('skip non-HTTP contexts so @SubscribeMessage handlers can run', async () => {
    const jwt = new JwtAuthGuard({} as never, {} as never, {} as never);
    const roles = new RolesGuard({} as never);
    const rate = new RateLimitGuard({} as never, {} as never);
    const requestId = new RequestIdInterceptor();
    const ctx = wsContext();

    await expect(jwt.canActivate(ctx)).resolves.toBe(true);
    expect(roles.canActivate(ctx)).toBe(true);
    await expect(rate.canActivate(ctx)).resolves.toBe(true);
    const next = { handle: jest.fn().mockReturnValue('ok') };
    expect(requestId.intercept(ctx, next)).toBe('ok');
    expect(next.handle).toHaveBeenCalled();
  });
});
