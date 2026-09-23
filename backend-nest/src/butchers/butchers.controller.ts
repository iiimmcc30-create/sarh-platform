import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ButchersService } from './butchers.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  OptionalAuth,
  Public,
  RateLimit,
} from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

@Controller('butchers')
export class ButchersController {
  constructor(private readonly butchers: ButchersService) {}

  @OptionalAuth()
  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @Query('cursor') cursor?: string,
    @Query('country') country?: string,
    @Query('search') search?: string,
    @Query('isOpen') isOpen?: string,
    @Query('sort') sort?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return successResponse(
      await this.butchers.listButchers({
        cursor,
        country,
        search,
        isOpen,
        sort,
        lat,
        lng,
      }),
    );
  }

  @RateLimit('api')
  @Post()
  register(@CurrentUser() _user: JwtPayload) {
    this.butchers.registerButcher();
  }

  @RateLimit('api')
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async stats(
    @CurrentUser() user: JwtPayload,
    @Query('period') period?: string,
  ) {
    return successResponse(await this.butchers.getStats(user, period));
  }

  @RateLimit('api')
  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  async dashboard(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.butchers.getDashboardSummary(user));
  }

  @RateLimit('api')
  @Get('products/mine')
  @HttpCode(HttpStatus.OK)
  async getMyProducts(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.butchers.getMyProducts(user));
  }

  @RateLimit('api')
  @Get('customers')
  @HttpCode(HttpStatus.OK)
  async getCustomers(
    @CurrentUser() user: JwtPayload,
    @Query() query: Record<string, unknown>,
  ) {
    return successResponse(await this.butchers.getCustomers(user, query ?? {}));
  }

  @RateLimit('api')
  @Get('reports')
  @HttpCode(HttpStatus.OK)
  async getReports(
    @CurrentUser() user: JwtPayload,
    @Query() query: Record<string, unknown>,
  ) {
    return successResponse(await this.butchers.getReports(user, query ?? {}));
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get('products')
  @HttpCode(HttpStatus.OK)
  async getProducts(@Query('butcherId') butcherId: string) {
    return successResponse(await this.butchers.getProducts(butcherId));
  }

  @RateLimit('api')
  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  async createProduct(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return successResponse(await this.butchers.createProduct(user, body));
  }

  @RateLimit('api')
  @Put('products/:id')
  @HttpCode(HttpStatus.OK)
  async updateProduct(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
  ) {
    return successResponse(await this.butchers.updateProduct(id, user, body));
  }

  @RateLimit('api')
  @Delete('products/:id')
  @HttpCode(HttpStatus.OK)
  async deleteProduct(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return successResponse(await this.butchers.deleteProduct(id, user));
  }

  @RateLimit('api')
  @Get('offers')
  @HttpCode(HttpStatus.OK)
  async listOffers(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.butchers.listOffers(user));
  }

  @RateLimit('api')
  @Post('offers')
  @HttpCode(HttpStatus.CREATED)
  async createOffer(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return successResponse(await this.butchers.createOffer(user, body));
  }

  @RateLimit('api')
  @Put('offers/:id')
  @HttpCode(HttpStatus.OK)
  async updateOffer(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
  ) {
    return successResponse(await this.butchers.updateOffer(id, user, body));
  }

  @RateLimit('api')
  @Delete('offers/:id')
  @HttpCode(HttpStatus.OK)
  async deleteOffer(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return successResponse(await this.butchers.deleteOffer(id, user));
  }

  @RateLimit('api')
  @Get('orders')
  @HttpCode(HttpStatus.OK)
  async getOrders(
    @CurrentUser() user: JwtPayload,
    @Query() query: Record<string, unknown>,
  ) {
    return successResponse(await this.butchers.getOrders(user, query ?? {}));
  }

  @RateLimit('api')
  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  async createOrder(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return successResponse(await this.butchers.createOrder(user, body));
  }

  @RateLimit('payment')
  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  async createCheckout(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return successResponse(await this.butchers.createCheckout(user, body));
  }

  @RateLimit('api')
  @Post('checkout/:id/abandon')
  @HttpCode(HttpStatus.OK)
  async abandonCheckout(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return successResponse(await this.butchers.abandonCheckout(user, id));
  }

  @RateLimit('api')
  @Put('orders/:id')
  @HttpCode(HttpStatus.OK)
  async updateOrder(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
  ) {
    return successResponse(await this.butchers.updateOrder(id, user, body));
  }

  @RateLimit('api')
  @Get('orders/:id')
  @HttpCode(HttpStatus.OK)
  async getOrderById(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return successResponse(await this.butchers.getOrderById(id, user));
  }

  @Public()
  @RateLimit('api')
  @Get('stories')
  @HttpCode(HttpStatus.OK)
  async getStories() {
    return successResponse(await this.butchers.getActiveStories());
  }

  @RateLimit('api')
  @Post('stories')
  @HttpCode(HttpStatus.CREATED)
  async createStory(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return successResponse(await this.butchers.createStory(user, body));
  }

  @RateLimit('api')
  @Delete('stories/:id')
  @HttpCode(HttpStatus.OK)
  async deleteStory(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return successResponse(await this.butchers.deleteStory(id, user));
  }

  @RateLimit('api')
  @Post(':id/favorite')
  @HttpCode(HttpStatus.OK)
  async addFavorite(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return successResponse(await this.butchers.addFavorite(id, user));
  }

  @RateLimit('api')
  @Delete(':id/favorite')
  @HttpCode(HttpStatus.OK)
  async removeFavorite(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return successResponse(await this.butchers.removeFavorite(id, user));
  }

  @RateLimit('api')
  @Get(':id/favorite')
  @HttpCode(HttpStatus.OK)
  async favoriteStatus(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return successResponse(await this.butchers.getFavoriteStatus(id, user));
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get(':id/chat-access')
  @HttpCode(HttpStatus.OK)
  async getChatAccess(
    @Param('id') id: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return successResponse(await this.butchers.getChatAccess(id, user));
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get(':id/reviews')
  @HttpCode(HttpStatus.OK)
  async getReviews(@Param('id') id: string) {
    return successResponse(await this.butchers.getReviews(id));
  }

  @RateLimit('api')
  @Post(':id/reviews')
  @HttpCode(HttpStatus.CREATED)
  async submitReview(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
  ) {
    return successResponse(await this.butchers.submitReview(id, user, body));
  }

  @OptionalAuth()
  @RateLimit('api')
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getButcher(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    return successResponse(await this.butchers.getButcher(id, user));
  }

  @RateLimit('api')
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async updateButcher(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: unknown,
  ) {
    return successResponse(await this.butchers.updateButcher(id, user, body));
  }
}
