import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

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
