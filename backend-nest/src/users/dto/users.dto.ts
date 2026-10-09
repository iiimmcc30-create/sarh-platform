import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { SUPPORTED_COUNTRIES } from '../../lib/countries';
import { IsOurUploadUrl } from '../validators/is-our-upload-url.validator';
import { MEDIA_URL_OPTS } from '../../shared/lib/media-url';

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

export class ConnectionsQueryDto {
  @IsOptional()
  @IsEnum(['followers', 'following'])
  type: 'followers' | 'following' = 'followers';
}

export class UsernameAvailableQueryDto {
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'أحرف إنجليزية صغيرة وأرقام وشرطة سفلية فقط',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s/g, '').toLowerCase() : value,
  )
  username!: string;
}

/** One profile link; strict URL/label rules live in lib/profile-links (service-side). */
export class ProfileLinkDto {
  @IsString()
  @MaxLength(300)
  url!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  label?: string | null;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  arabicName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  bio?: string;

  /** Profile links under the bio (max 3, http/https). `null` or `[]` clears them. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ProfileLinkDto)
  links?: ProfileLinkDto[] | null;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'أحرف إنجليزية صغيرة وأرقام وشرطة سفلية فقط',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  username?: string;

  @IsOptional()
  @IsUrl(MEDIA_URL_OPTS)
  @IsOurUploadUrl()
  avatar?: string;

  /** `null` removes the profile cover (back to the default). */
  @IsOptional()
  @IsUrl(MEDIA_URL_OPTS)
  @IsOurUploadUrl()
  coverImage?: string | null;

  @IsOptional()
  @IsEnum(SUPPORTED_COUNTRIES)
  country?: (typeof SUPPORTED_COUNTRIES)[number];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  fcmToken?: string | null;

  @IsOptional()
  @IsBoolean()
  unregisterFcm?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  fcmPlatform?: string;

  @IsOptional()
  @IsBoolean()
  showInSearch?: boolean;

  @IsOptional()
  @IsBoolean()
  allowPrivateMessages?: boolean;

  @IsOptional()
  @IsBoolean()
  showFollowingList?: boolean;

  @IsOptional()
  @IsEnum(['everyone', 'followers'])
  commentsAudience?: 'everyone' | 'followers';

  @IsOptional()
  @IsEnum(['everyone', 'following', 'followers'])
  privateMessagesAudience?: 'everyone' | 'following' | 'followers';

  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  @MaxLength(120)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  birthDate?: string | null;
}

export class RateUserDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;
}

export class SetFollowDto {
  @IsBoolean()
  following: boolean;
}

export class SetBlockDto {
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  blocked: boolean;
}

export class UpdatePrivacySettingsDto {
  @IsOptional()
  @IsBoolean()
  showInSearch?: boolean;

  @IsOptional()
  @IsBoolean()
  allowPrivateMessages?: boolean;

  @IsOptional()
  @IsBoolean()
  showFollowingList?: boolean;

  @IsOptional()
  @IsEnum(['everyone', 'followers'])
  commentsAudience?: 'everyone' | 'followers';

  @IsOptional()
  @IsEnum(['everyone', 'following', 'followers'])
  privateMessagesAudience?: 'everyone' | 'following' | 'followers';

  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}

export class UpdateAccountSettingsDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  @MaxLength(120)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  birthDate?: string | null;
}

export class ChangePhoneDto {
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'رقم الجوال غير صالح',
  })
  phone!: string;

  @IsString()
  phone_token!: string;
}
