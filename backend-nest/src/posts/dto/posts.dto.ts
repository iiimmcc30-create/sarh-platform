import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { MEDIA_URL_OPTS } from '../../shared/lib/media-url';
import {
  MAX_POST_MEDIA,
  POST_MEDIA_TYPES,
  type PostMediaKind,
} from '../lib/post-media';

export class PostMediaItemDto {
  @IsUrl(MEDIA_URL_OPTS)
  url!: string;

  @IsIn(POST_MEDIA_TYPES)
  type!: PostMediaKind;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  sortOrder?: number;
}

export class ListPostsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  /** `for_you` (default) or `following` — X-style feed tabs */
  @IsOptional()
  @IsString()
  feed?: 'for_you' | 'following';
}

export class CreatePostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  content!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(280)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  arabicContent!: string;

  @IsOptional()
  @IsUrl(MEDIA_URL_OPTS)
  image?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsUrl(MEDIA_URL_OPTS, { each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_POST_MEDIA)
  @ValidateNested({ each: true })
  @Type(() => PostMediaItemDto)
  media?: PostMediaItemDto[];
}

export class UpdatePostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  content!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(280)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  arabicContent!: string;

  @IsOptional()
  @IsUrl(MEDIA_URL_OPTS)
  image?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsUrl(MEDIA_URL_OPTS, { each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_POST_MEDIA)
  @ValidateNested({ each: true })
  @Type(() => PostMediaItemDto)
  media?: PostMediaItemDto[];
}

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  content!: string;
}
