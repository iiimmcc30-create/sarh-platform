import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export const FEED_PRODUCT_CATEGORIES = [
  'livestock',
  'sheep',
  'camels',
  'poultry',
  'hay',
  'barley',
] as const;

export type FeedProductCategoryValue = (typeof FEED_PRODUCT_CATEGORIES)[number];

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function emptyToUndefined(value: unknown) {
  if (typeof value !== 'string') return value;
  const next = value.trim();
  return next.length ? next : undefined;
}

export class FeedSupplierListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => emptyToUndefined(value))
  q?: string;

  @IsOptional()
  @IsIn(FEED_PRODUCT_CATEGORIES)
  category?: FeedProductCategoryValue;
}

export class CreateFeedSupplierDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(({ value }) => trimString(value))
  nameAr!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Transform(({ value }) => trimString(value))
  cityAr!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => emptyToUndefined(value))
  logo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => emptyToUndefined(value))
  cover?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => emptyToUndefined(value))
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => emptyToUndefined(value))
  districtAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  @Transform(({ value }) => emptyToUndefined(value))
  addressAr?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => emptyToUndefined(value))
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => emptyToUndefined(value))
  whatsapp?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  @Transform(({ value }) => emptyToUndefined(value))
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => emptyToUndefined(value))
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  @Transform(({ value }) => emptyToUndefined(value))
  hoursAr?: string;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class UpdateFeedSupplierDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(({ value }) => trimString(value))
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Transform(({ value }) => trimString(value))
  cityAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  logo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  cover?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => emptyToUndefined(value))
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => emptyToUndefined(value))
  districtAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  @Transform(({ value }) => emptyToUndefined(value))
  addressAr?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => emptyToUndefined(value))
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => emptyToUndefined(value))
  whatsapp?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  @Transform(({ value }) => emptyToUndefined(value))
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  website?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  @Transform(({ value }) => emptyToUndefined(value))
  hoursAr?: string;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class CreateFeedProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @Transform(({ value }) => trimString(value))
  nameAr!: string;

  @IsIn(FEED_PRODUCT_CATEGORIES)
  category!: FeedProductCategoryValue;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => emptyToUndefined(value))
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => emptyToUndefined(value))
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => emptyToUndefined(value))
  weightLabel?: string;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class UpdateFeedProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @Transform(({ value }) => trimString(value))
  nameAr?: string;

  @IsOptional()
  @IsIn(FEED_PRODUCT_CATEGORIES)
  category?: FeedProductCategoryValue;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => emptyToUndefined(value))
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => emptyToUndefined(value))
  weightLabel?: string;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}
