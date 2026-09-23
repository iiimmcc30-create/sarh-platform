import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminService } from './admin.service';
import { Public, RateLimit, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import type { AdminLoginDto } from './dto/admin.dto';

const STAFF = ['ADMIN', 'MODERATOR'] as const;

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ─── Auth ───────────────────────────────────────────────────────────────────

  @Public()
  @RateLimit('auth')
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: AdminLoginDto, @Req() req: Request) {
    return successResponse(await this.admin.adminLogin(body, req));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('auth/me')
  @HttpCode(HttpStatus.OK)
  async me(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.admin.adminMe(user));
  }

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('listing-fee-compliance')
  @HttpCode(HttpStatus.OK)
  async listingFeeCompliance() {
    return successResponse(await this.admin.listListingFeeCompliance());
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Post('users/:id/listing-fee-enforcement')
  @HttpCode(HttpStatus.OK)
  async listingFeeEnforcement(
    @Param('id') id: string,
    @CurrentUser() actor: JwtPayload,
    @Body() body: { reason?: string },
  ) {
    return successResponse(
      await this.admin.closeAccountForUnpaidListingFees(
        id,
        actor,
        body.reason ?? '',
      ),
    );
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('dashboard/stats')
  @HttpCode(HttpStatus.OK)
  async dashboardStats() {
    return successResponse(await this.admin.getDashboardStats());
  }

  // ─── Users ──────────────────────────────────────────────────────────────────

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('users')
  @HttpCode(HttpStatus.OK)
  async listUsers(@Query() query: Record<string, unknown>) {
    return successResponse(await this.admin.listUsers(query));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('users/:id')
  @HttpCode(HttpStatus.OK)
  async getUser(@Param('id') id: string) {
    return successResponse(await this.admin.getUser(id));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Patch('users/:id')
  @HttpCode(HttpStatus.OK)
  async updateUser(
    @Param('id') id: string,
    @CurrentUser() actor: JwtPayload,
    @Body() body: Record<string, unknown>,
  ) {
    return successResponse(await this.admin.updateUser(id, body, actor));
  }

  @Roles('ADMIN')
  @RateLimit('api')
  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return successResponse(await this.admin.deleteUser(id, user));
  }

  // ─── Posts ──────────────────────────────────────────────────────────────────

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('posts')
  @HttpCode(HttpStatus.OK)
  async listPosts(@Query() query: Record<string, unknown>) {
    return successResponse(await this.admin.listPosts(query));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Patch('posts/:id')
  @HttpCode(HttpStatus.OK)
  async updatePost(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return successResponse(await this.admin.updatePost(id, body));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Delete('posts/:id')
  @HttpCode(HttpStatus.OK)
  async deletePost(@Param('id') id: string) {
    return successResponse(await this.admin.deletePost(id));
  }

  // ─── Listings ───────────────────────────────────────────────────────────────

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('listings')
  @HttpCode(HttpStatus.OK)
  async listListings(@Query() query: Record<string, unknown>) {
    return successResponse(await this.admin.listListings(query));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Patch('listings/:id')
  @HttpCode(HttpStatus.OK)
  async updateListing(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return successResponse(await this.admin.updateListing(id, body));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Delete('listings/:id')
  @HttpCode(HttpStatus.OK)
  async deleteListing(
    @Param('id') id: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return successResponse(await this.admin.deleteListing(id, actor));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Post('listings/managed')
  @HttpCode(HttpStatus.OK)
  async createManagedListing(
    @CurrentUser() actor: JwtPayload,
    @Body() body: Record<string, unknown>,
  ) {
    return successResponse(await this.admin.createManagedListing(actor, body));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Patch('listings/:id/managed')
  @HttpCode(HttpStatus.OK)
  async updateManagedListing(
    @CurrentUser() actor: JwtPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return successResponse(
      await this.admin.updateManagedListing(actor, id, body),
    );
  }

  // ─── Reports / Tickets ──────────────────────────────────────────────────────

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('reports')
  @HttpCode(HttpStatus.OK)
  async listReports(@Query() query: Record<string, unknown>) {
    return successResponse(await this.admin.listReports(query));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('reports/:id')
  @HttpCode(HttpStatus.OK)
  async getReport(@Param('id') id: string) {
    return successResponse(await this.admin.getReport(id));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Patch('reports/:id')
  @HttpCode(HttpStatus.OK)
  async updateReport(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return successResponse(await this.admin.updateReport(id, body));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Delete('reports/:id')
  @HttpCode(HttpStatus.OK)
  async deleteReport(@Param('id') id: string) {
    return successResponse(await this.admin.deleteReport(id));
  }

  // ─── Livestreams ────────────────────────────────────────────────────────────

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('livestreams')
  @HttpCode(HttpStatus.OK)
  async listLiveStreams(@Query() query: Record<string, unknown>) {
    return successResponse(await this.admin.listLiveStreams(query));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Post('livestreams/:id')
  @HttpCode(HttpStatus.OK)
  async stopLiveStream(@Param('id') id: string) {
    return successResponse(await this.admin.stopLiveStream(id));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Delete('livestreams/:id')
  @HttpCode(HttpStatus.OK)
  async deleteLiveStream(@Param('id') id: string) {
    return successResponse(await this.admin.deleteLiveStream(id));
  }

  // ─── Butchers ───────────────────────────────────────────────────────────────

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('butchers')
  @HttpCode(HttpStatus.OK)
  async listButchers(@Query() query: Record<string, unknown>) {
    return successResponse(await this.admin.listButchers(query));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('butchers/:id')
  @HttpCode(HttpStatus.OK)
  async getButcher(@Param('id') id: string) {
    return successResponse(await this.admin.getButcher(id));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('orders')
  @HttpCode(HttpStatus.OK)
  async listOrders(@Query() query: Record<string, unknown>) {
    return successResponse(await this.admin.listOrders(query));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('orders/:id')
  @HttpCode(HttpStatus.OK)
  async getOrder(@Param('id') id: string) {
    return successResponse(await this.admin.getOrder(id));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Patch('butchers/:id')
  @HttpCode(HttpStatus.OK)
  async updateButcher(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return successResponse(await this.admin.updateButcher(id, body));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Delete('butchers/:id')
  @HttpCode(HttpStatus.OK)
  async deleteButcher(@Param('id') id: string) {
    return successResponse(await this.admin.deleteButcher(id));
  }

  // ─── Settings (ADMIN only) ──────────────────────────────────────────────────

  @Roles('ADMIN')
  @RateLimit('api')
  @Get('settings')
  @HttpCode(HttpStatus.OK)
  async listSettings() {
    return successResponse(await this.admin.listSettings());
  }

  @Roles('ADMIN')
  @RateLimit('api')
  @Put('settings')
  @HttpCode(HttpStatus.OK)
  async updateSetting(@Body() body: Record<string, unknown>) {
    return successResponse(await this.admin.updateSetting(body));
  }

  // ─── Content Sections ───────────────────────────────────────────────────────

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('sections')
  @HttpCode(HttpStatus.OK)
  async listSections() {
    return successResponse(await this.admin.listSections());
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Post('sections')
  @HttpCode(HttpStatus.CREATED)
  async createSection(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtPayload,
  ) {
    return successResponse(await this.admin.createSection(body, user.username));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Patch('sections/:id')
  @HttpCode(HttpStatus.OK)
  async updateSection(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtPayload,
  ) {
    return successResponse(
      await this.admin.updateSection(id, body, user.username),
    );
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Post('sections/:id/publish')
  @HttpCode(HttpStatus.OK)
  async publishSection(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtPayload,
  ) {
    return successResponse(
      await this.admin.publishSection(id, body ?? {}, user.username),
    );
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Post('sections/:id/unpublish')
  @HttpCode(HttpStatus.OK)
  async unpublishSection(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return successResponse(
      await this.admin.unpublishSection(id, user.username),
    );
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('sections/:id/versions')
  @HttpCode(HttpStatus.OK)
  async listSectionVersions(@Param('id') id: string) {
    return successResponse(await this.admin.listSectionVersions(id));
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Post('sections/:id/restore/:versionId')
  @HttpCode(HttpStatus.OK)
  async restoreSectionVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return successResponse(
      await this.admin.restoreSectionVersion(id, versionId, user.username),
    );
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Delete('sections/:id')
  @HttpCode(HttpStatus.OK)
  async deleteSection(@Param('id') id: string) {
    return successResponse(await this.admin.deleteSection(id));
  }

  // ─── Maintenance ────────────────────────────────────────────────────────────

  @Public()
  @RateLimit('api')
  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  async cleanup(
    @Req() req: Request,
    @Headers('x-cron-secret') cronSecret?: string,
  ) {
    return successResponse(
      await this.admin.runCleanupAuthorized(
        cronSecret,
        req.headers.authorization,
      ),
    );
  }
}
