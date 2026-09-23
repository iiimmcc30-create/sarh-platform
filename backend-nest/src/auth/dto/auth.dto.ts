import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { SUPPORTED_COUNTRIES } from '../../lib/countries';
import { normalizeE164Phone, SAUDI_MOBILE_E164 } from '../../lib/phone';

const saudiMobileMessage = 'رقم الجوال يجب أن يكون بصيغة +9665xxxxxxxx';

function normalizePhoneTransform({ value }: { value: unknown }) {
  return typeof value === 'string' ? normalizeE164Phone(value.trim()) : value;
}

export class LoginDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  login!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  allDevices?: boolean;
}

export class RegisterDto {
  @Transform(normalizePhoneTransform)
  @Matches(SAUDI_MOBILE_E164, { message: saudiMobileMessage })
  phone!: string;

  @IsString()
  @MinLength(10)
  phone_token!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  displayName!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  arabicName?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'أحرف إنجليزية صغيرة وأرقام وشرطة سفلية فقط',
  })
  username!: string;

  @IsOptional()
  @IsEnum(SUPPORTED_COUNTRIES)
  country?: (typeof SUPPORTED_COUNTRIES)[number] = 'SA';

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsString()
  googleId?: string;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  email?: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/[A-Z]/, { message: 'Must contain uppercase' })
  @Matches(/[0-9]/, { message: 'Must contain number' })
  newPassword!: string;
}

export class SendOtpDto {
  @Transform(normalizePhoneTransform)
  @Matches(SAUDI_MOBILE_E164, { message: saudiMobileMessage })
  phone!: string;

  @IsOptional()
  @IsEnum(['sms', 'whatsapp'])
  channel: 'sms' | 'whatsapp' = 'sms';

  /** login = default; signup = create account (reject if phone exists); join = butcher join */
  @IsOptional()
  @IsEnum(['login', 'signup', 'join', 'reset_password'])
  purpose?: 'login' | 'signup' | 'join' | 'reset_password' = 'login';
}

export class VerifyOtpDto {
  @Transform(normalizePhoneTransform)
  @Matches(SAUDI_MOBILE_E164, { message: saudiMobileMessage })
  phone!: string;

  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;

  @IsOptional()
  @IsEnum(['login', 'reset_password', 'join', 'signup'])
  purpose: 'login' | 'reset_password' | 'join' | 'signup' = 'login';
}

/** Early uniqueness check for signup UX (phone / username). */
export class CheckSignupDto {
  @IsOptional()
  @Transform(normalizePhoneTransform)
  @Matches(SAUDI_MOBILE_E164, { message: saudiMobileMessage })
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'أحرف إنجليزية صغيرة وأرقام وشرطة سفلية فقط',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  username?: string;
}

export class GoogleAuthDto {
  @IsString()
  @MinLength(10)
  id_token!: string;
}

export class ResetPasswordDto {
  @Transform(normalizePhoneTransform)
  @Matches(SAUDI_MOBILE_E164, { message: saudiMobileMessage })
  phone!: string;

  @IsString()
  @MinLength(10)
  phone_token!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  newPassword!: string;
}

export class VerifyEmailDto {
  @Length(6, 6)
  @Matches(/^\d+$/)
  code!: string;
}
