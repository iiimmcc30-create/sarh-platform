import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KnowledgeArticleStatus, KnowledgeSourceType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { MEDIA_URL_OPTS } from '../../shared/lib/media-url';

export class CreateKnowledgeSourceDto {
  @ApiProperty({ example: 'وزارة البيئة والمياه والزراعة' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'https://www.mewa.gov.sa/rss.xml' })
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  url!: string;

  @ApiProperty({ enum: KnowledgeSourceType, default: KnowledgeSourceType.RSS })
  @IsEnum(KnowledgeSourceType)
  type!: KnowledgeSourceType;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateKnowledgeSourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  url?: string;

  @ApiPropertyOptional({ enum: KnowledgeSourceType })
  @IsOptional()
  @IsEnum(KnowledgeSourceType)
  type?: KnowledgeSourceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ListKnowledgeArticlesQueryDto {
  @ApiPropertyOptional({ enum: KnowledgeArticleStatus })
  @IsOptional()
  @IsEnum(KnowledgeArticleStatus)
  status?: KnowledgeArticleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}

export class CreateKnowledgePostDto {
  @ApiProperty({ example: 'محتوى المنشور الذي سينشر باسم مركز المعرفة' })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  content!: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/image.jpg' })
  @IsOptional()
  @IsUrl(MEDIA_URL_OPTS)
  @MaxLength(500)
  imageUrl?: string;
}

export class UpdateKnowledgeProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(MEDIA_URL_OPTS)
  @MaxLength(500)
  avatar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;
}

export class ListKnowledgeLogsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}
