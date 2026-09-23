import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

const UPLOAD_FOLDERS = [
  'avatars',
  'listings',
  'stories',
  'butchers',
  'posts',
  'temp',
  'messages',
  'butcher-applications',
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
}

export { UPLOAD_FOLDERS };
