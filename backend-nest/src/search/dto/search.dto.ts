import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SUPPORTED_COUNTRIES } from '../../lib/countries';

export const SEARCH_TYPES = [
  'all',
  'listings',
  'posts',
  'news',
  'services',
  'users',
] as const;

export type SearchType = (typeof SEARCH_TYPES)[number];

export class UnifiedSearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  q!: string;

  @IsOptional()
  @IsEnum(SEARCH_TYPES)
  type?: SearchType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  /** Marketplace filters (listings type / all) */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  @IsOptional()
  @IsEnum(SUPPORTED_COUNTRIES)
  country?: (typeof SUPPORTED_COUNTRIES)[number];

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  maxPrice?: number;

  /** Region/city hint — matched against location strings */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  region?: string;
}

export class SearchSuggestQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  limit?: number;
}

export class TrendingSearchQueryDto {
  @IsOptional()
  @IsEnum(['6h', '24h', '7d'] as const)
  window?: '6h' | '24h' | '7d';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number;
}
