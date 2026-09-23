import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import {
  CreateFeedProductDto,
  CreateFeedSupplierDto,
  UpdateFeedProductDto,
  UpdateFeedSupplierDto,
} from './dto/feed-suppliers.dto';
import { FeedSuppliersService } from './feed-suppliers.service';

const STAFF = ['ADMIN', 'MODERATOR'] as const;

@Controller('admin/feed-suppliers')
export class AdminFeedSuppliersController {
  constructor(private readonly suppliers: FeedSuppliersService) {}

  @Roles(...STAFF)
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@Query('q') q?: string) {
    const suppliers = await this.suppliers.listAdmin(q);
    return successResponse({ suppliers });
  }

  @Roles(...STAFF)
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getById(@Param('id') id: string) {
    const supplier = await this.suppliers.getAdmin(id);
    return successResponse({ supplier });
  }

  @Roles('ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateFeedSupplierDto) {
    const supplier = await this.suppliers.create(dto);
    return successResponse({ supplier });
  }

  @Roles('ADMIN')
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() dto: UpdateFeedSupplierDto) {
    const supplier = await this.suppliers.update(id, dto);
    return successResponse({ supplier });
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    return successResponse(await this.suppliers.remove(id));
  }

  @Roles('ADMIN')
  @Post(':id/products')
  @HttpCode(HttpStatus.CREATED)
  async createProduct(
    @Param('id') id: string,
    @Body() dto: CreateFeedProductDto,
  ) {
    const product = await this.suppliers.createProduct(id, dto);
    return successResponse({ product });
  }
}

@Controller('admin/feed-products')
export class AdminFeedProductsController {
  constructor(private readonly suppliers: FeedSuppliersService) {}

  @Roles('ADMIN')
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() dto: UpdateFeedProductDto) {
    const product = await this.suppliers.updateProduct(id, dto);
    return successResponse({ product });
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    return successResponse(await this.suppliers.removeProduct(id));
  }
}
