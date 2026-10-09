import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateNotificationPrefsDto {
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  messages?: boolean;

  @IsOptional()
  @IsBoolean()
  follows?: boolean;

  @IsOptional()
  @IsBoolean()
  interactions?: boolean;

  @IsOptional()
  @IsBoolean()
  followingPosts?: boolean;

  @IsOptional()
  @IsBoolean()
  councils?: boolean;

  @IsOptional()
  @IsBoolean()
  offers?: boolean;
}

export class SetMuteDto {
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  muted: boolean;
}

/** The caller's own refresh token: marks «هذا الجهاز» / keeps it when signing others out. */
export class SessionLookupDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  refreshToken?: string;
}

export class RevokeOtherSessionsDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  refreshToken: string;
}
