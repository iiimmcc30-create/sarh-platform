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

export const SEARCH_ANIMAL_TYPES = [
  'sheep',
  'goat',
  'camel',
  'cattle',
  'horse',
] as const;

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

  /** Advanced (optional): livestock animal type -> listing category filter. */
  @IsOptional()
  @IsEnum(SEARCH_ANIMAL_TYPES)
  animalType?: (typeof SEARCH_ANIMAL_TYPES)[number];

  /** Advanced (optional): breed name, matched in breed/title/description. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  breed?: string;

  /** Advanced (optional): ranking hint only (text-derived, never a hard filter). */
  @IsOptional()
  @IsEnum(['male', 'female'] as const)
  gender?: 'male' | 'female';

  /** Advanced (optional): age/stage term - ranking hint only. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  ageStage?: string;
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
