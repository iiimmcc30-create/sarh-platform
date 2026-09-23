import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  STORY_IMAGE_DURATION_SEC,
  STORY_MAX_DURATION_SEC,
  STORY_MIN_DURATION_SEC,
} from '@/lib/stories';

const MEDIA_URL_OPTS = {
  require_tld: false,
  protocols: ['http', 'https'] as ('http' | 'https')[],
};

export const STORY_REACTION_TYPES = [
  'like',
  'love',
  'fire',
  'wow',
  'sad',
] as const;

export type StoryReactionType = (typeof STORY_REACTION_TYPES)[number];

export class CreateStoryDto {
  @ApiProperty({ description: 'Story thumbnail / image URL' })
  @IsUrl(MEDIA_URL_OPTS)
  thumbnail!: string;

  @ApiPropertyOptional({ description: 'Video URL when story is video' })
  @IsOptional()
  @IsUrl(MEDIA_URL_OPTS)
  mediaUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  captionAr?: string | null;

  @ApiPropertyOptional({ description: 'Optional location label' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsOptional()
  @IsBoolean()
  isLive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  liveStreamId?: string | null;

  @ApiPropertyOptional({ description: 'Optional linked listing id' })
  @IsOptional()
  @IsUUID()
  listingId?: string | null;

  @ApiPropertyOptional({
    description: 'Display duration in seconds',
    minimum: STORY_MIN_DURATION_SEC,
    maximum: STORY_MAX_DURATION_SEC,
  })
  @IsOptional()
  @IsInt()
  @Min(STORY_MIN_DURATION_SEC)
  @Max(STORY_MAX_DURATION_SEC)
  @Type(() => Number)
  duration?: number;
}

export class StoryReactionDto {
  @ApiProperty({ enum: STORY_REACTION_TYPES })
  @IsEnum(STORY_REACTION_TYPES)
  type!: StoryReactionType;
}

export class StoryReplyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  text!: string;
}

const BUTCHER_STORY_TYPES = [
  'daily_slaughter',
  'offer',
  'new_stock',
  'update',
] as const;

export class CreateButcherStoryDto {
  @IsUrl(MEDIA_URL_OPTS)
  thumbnail!: string;

  @IsOptional()
  @IsUrl(MEDIA_URL_OPTS)
  mediaUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  captionAr?: string | null;

  @IsEnum(BUTCHER_STORY_TYPES)
  type!: (typeof BUTCHER_STORY_TYPES)[number];

  @IsOptional()
  @IsInt()
  @Min(STORY_MIN_DURATION_SEC)
  @Max(STORY_MAX_DURATION_SEC)
  @Type(() => Number)
  duration?: number;
}

export { STORY_IMAGE_DURATION_SEC };
