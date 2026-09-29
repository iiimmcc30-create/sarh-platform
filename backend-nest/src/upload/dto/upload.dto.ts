import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const UPLOAD_FOLDERS = [
  'avatars',
  'listings',
  'stories',
  'posts',
  'temp',
  'messages',
  'support',
] as const;

export class PresignUploadDto {
  @IsString()
  mimetype!: string;

  @IsEnum(UPLOAD_FOLDERS)
  folder!: (typeof UPLOAD_FOLDERS)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  @Type(() => Number)
  count?: number;

  /**
   * Opt-in protected delivery for chat media (`messages` folder only).
   * New app builds send `authenticated`; older builds omit it and keep public
   * uploads, so their signed params are unchanged.
   */
  @IsOptional()
  @IsIn(['authenticated'])
  delivery?: 'authenticated';
}

export { UPLOAD_FOLDERS };
