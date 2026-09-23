import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import {
  renderButcherJoinPage,
  renderButcherJoinSuccessPage,
} from './join-page.html';

@Controller()
export class JoinPageController {
  @Public()
  @RateLimit('api')
  @Get('join')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  join(@Res() res: Response) {
    res.status(200).send(renderButcherJoinPage());
  }

  @Public()
  @RateLimit('api')
  @Get('join/success')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  success(
    @Query('n') n: string | undefined,
    @Query('name') name: string | undefined,
    @Res() res: Response,
  ) {
    res.status(200).send(
      renderButcherJoinSuccessPage({
        applicationNumber: n,
        nameAr: name,
      }),
    );
  }
}
