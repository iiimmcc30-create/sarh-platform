import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import { FeedSupplierListQueryDto } from './dto/feed-suppliers.dto';
import { FeedSuppliersService } from './feed-suppliers.service';

@Controller('feed-suppliers')
export class FeedSuppliersController {
  constructor(private readonly suppliers: FeedSuppliersService) {}

  @Public()
  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@Query() query: FeedSupplierListQueryDto) {
    const suppliers = await this.suppliers.listPublic(query.q, query.category);
    return successResponse({ suppliers });
  }

  @Public()
  @RateLimit('api')
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getById(@Param('id') id: string) {
    const supplier = await this.suppliers.getPublic(id);
    return successResponse({ supplier });
  }
}
