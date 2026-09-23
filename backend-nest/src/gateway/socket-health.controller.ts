import { Controller, Get, HttpCode } from '@nestjs/common';
import { Public, SkipRateLimit } from '../common/decorators/auth.decorators';

@SkipRateLimit()
@Controller('health')
export class SocketHealthController {
  @Public()
  @Get()
  @HttpCode(200)
  ping() {
    return { status: 'ok', service: 'socket' };
  }
}
