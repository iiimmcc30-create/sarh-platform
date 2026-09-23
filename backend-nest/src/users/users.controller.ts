import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Patch,
  Query,
} from '@nestjs/common';
import { UsersService } from './services/users.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  OptionalAuth,
  Public,
  RateLimit,
} from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  ChangePhoneDto,
  ConnectionsQueryDto,
  ListUsersQueryDto,
  RateUserDto,
  SetBlockDto,
  SetFollowDto,
  UpdateAccountSettingsDto,
  UpdatePrivacySettingsDto,
  UpdateUserDto,
  UsernameAvailableQueryDto,
} from './dto/users.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Public()
  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@Query() query: ListUsersQueryDto) {
    return successResponse(await this.users.listUsers(query));
  }

  @RateLimit('api')
  @Get('blocked')
  @HttpCode(HttpStatus.OK)
  async listBlocked(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.users.listBlocked(user.userId));
  }

  @RateLimit('api')
  @Get('me/account')
  @HttpCode(HttpStatus.OK)
  async getAccount(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.users.getAccountSettings(user.userId));
  }

  @RateLimit('api')
  @Patch('me/account')
  @HttpCode(HttpStatus.OK)
  async updateAccount(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateAccountSettingsDto,
  ) {
    return successResponse(
      await this.users.updateAccountSettings(user.userId, dto),
    );
  }

  @RateLimit('api')
  @Post('me/phone')
  @HttpCode(HttpStatus.OK)
  async changePhone(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePhoneDto,
  ) {
    return successResponse(await this.users.changePhone(user.userId, dto));
  }

  @RateLimit('api')
  @Get('me/privacy')
  @HttpCode(HttpStatus.OK)
  async getPrivacy(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.users.getPrivacySettings(user.userId));
  }

  @RateLimit('api')
  @Patch('me/privacy')
  @HttpCode(HttpStatus.OK)
  async updatePrivacy(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePrivacySettingsDto,
  ) {
    return successResponse(
      await this.users.updatePrivacySettings(user.userId, dto),
    );
  }

  @RateLimit('api')
  @Get('username-available')
  @HttpCode(HttpStatus.OK)
  async usernameAvailable(
    @Query() query: UsernameAvailableQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return successResponse(
      await this.users.isUsernameAvailable(query.username, user.userId),
    );
  }

  @Public()
  @OptionalAuth()
  @RateLimit('api')
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  async getById(@Param('id') id: string, @CurrentUser() viewer?: JwtPayload) {
    return successResponse(await this.users.getUser(id, viewer));
  }

  @RateLimit('api')
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateUserDto,
  ) {
    return successResponse(await this.users.updateUser(id, user, dto));
  }

  @RateLimit('api')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return successResponse(await this.users.deleteUser(id, user));
  }

  @RateLimit('api')
  @Post(':id/follow')
  @HttpCode(HttpStatus.OK)
  async follow(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SetFollowDto,
  ) {
    return successResponse(
      await this.users.setFollow(id, user.userId, dto.following),
    );
  }

  @RateLimit('api')
  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  async block(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SetBlockDto,
  ) {
    return successResponse(
      await this.users.setBlock(id, user.userId, dto.blocked),
    );
  }

  @RateLimit('api')
  @Post(':id/rate')
  @HttpCode(HttpStatus.OK)
  async rate(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RateUserDto,
  ) {
    return successResponse(
      await this.users.rateUser(id, user.userId, dto.rating),
    );
  }

  @Public()
  @OptionalAuth()
  @RateLimit('api')
  @Get(':id/connections')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  async connections(
    @Param('id') id: string,
    @Query() query: ConnectionsQueryDto,
    @CurrentUser() viewer?: JwtPayload,
  ) {
    return successResponse(await this.users.getConnections(id, query, viewer));
  }
}
