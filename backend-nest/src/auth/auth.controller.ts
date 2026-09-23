import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './services/auth.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  Public,
  RateLimit,
  SkipRateLimit,
} from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  ChangePasswordDto,
  CheckSignupDto,
  GoogleAuthDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  SendOtpDto,
  VerifyEmailDto,
  VerifyOtpDto,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @RateLimit('auth')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return successResponse(await this.auth.login(dto, req));
  }

  @Public()
  @RateLimit('auth')
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return successResponse(await this.auth.register(dto, req));
  }

  @Public()
  @RateLimit('auth')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    return successResponse(await this.auth.refresh(dto));
  }

  @SkipRateLimit()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Headers('authorization') authHeader: string,
    @Body() dto: LogoutDto,
  ) {
    const accessToken = authHeader.slice(7);
    return successResponse(await this.auth.logout(user, accessToken, dto));
  }

  @RateLimit('auth')
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Headers('authorization') authHeader: string,
    @Body() dto: ChangePasswordDto,
  ) {
    const accessToken = authHeader.slice(7);
    return successResponse(
      await this.auth.changePassword(user, accessToken, dto),
    );
  }

  @Public()
  @RateLimit('auth')
  @Post('check-signup')
  @HttpCode(HttpStatus.OK)
  async checkSignup(@Body() dto: CheckSignupDto) {
    return successResponse(await this.auth.checkSignup(dto));
  }

  @Public()
  @RateLimit('auth')
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() dto: SendOtpDto) {
    return successResponse(await this.auth.sendOtp(dto));
  }

  @Public()
  @RateLimit('auth')
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return successResponse(await this.auth.verifyOtp(dto, req));
  }

  @Public()
  @RateLimit('auth')
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async google(@Body() dto: GoogleAuthDto, @Req() req: Request) {
    return successResponse(await this.auth.googleAuth(dto, req));
  }

  @Public()
  @RateLimit('auth')
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return successResponse(await this.auth.resetPassword(dto));
  }

  @RateLimit('auth')
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @CurrentUser() user: JwtPayload,
    @Body() dto: VerifyEmailDto,
  ) {
    return successResponse(await this.auth.verifyEmail(user, dto));
  }

  @RateLimit('auth')
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.auth.resendVerification(user));
  }
}
