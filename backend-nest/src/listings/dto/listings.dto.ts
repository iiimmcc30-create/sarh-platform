import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { SUPPORTED_COUNTRIES } from '../../lib/countries';
import { MEDIA_URL_OPTS } from '../../shared/lib/media-url';
import { LISTING_CATEGORIES } from '../listing-categories';

export { LISTING_CATEGORIES };

export class ListListingsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsEnum(LISTING_CATEGORIES)
  category?: (typeof LISTING_CATEGORIES)[number];

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
  @IsString()
  @MinLength(2)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  suggested?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  promoted?: boolean;

  @IsOptional()
  @IsString()
  sellerId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxPrice?: number;
}

export class CreateListingDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  arabicTitle!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  arabicDescription!: string;

  @IsNumber()
  @Min(0.01)
  @Max(10_000_000)
  @Type(() => Number)
  price!: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  /** Legacy enum — optional when categoryId and/or subcategoryId are provided. */
  @ValidateIf((o: CreateListingDto) => !o.categoryId && !o.subcategoryId)
  @IsEnum(LISTING_CATEGORIES)
  category?: (typeof LISTING_CATEGORIES)[number];

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  breed?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  age?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  @Type(() => Number)
  quantity?: number;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  location!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  arabicLocation!: string;

  @IsEnum(SUPPORTED_COUNTRIES)
  country!: (typeof SUPPORTED_COUNTRIES)[number];

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'رقم التواصل غير صالح',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value,
  )
  contactPhone?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50_000)
  @Type(() => Number)
  weightKg?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsUrl(MEDIA_URL_OPTS, { each: true })
  images!: string[];

  /** Optional video — one per listing, max 45 s, uploaded before listing creation. */
  @IsOptional()
  @IsUrl(MEDIA_URL_OPTS)
  videoUrl?: string;

  @IsOptional()
  @IsUrl(MEDIA_URL_OPTS)
  thumbnailUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(45)
  @Type(() => Number)
  videoDuration?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  videoWidth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  videoHeight?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  videoFileSize?: number;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  /** Required when listing fees are enabled — backend is the source of truth. */
  @IsOptional()
  @IsBoolean()
  acceptedCovenant?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  covenantVersion?: string;
}

export class DeleteListingDto {
  @IsBoolean()
  sold!: boolean;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reason!: string;
}

export class ApplyPlanPromoteDto {
  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class UpdateListingDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  arabicTitle?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  arabicDescription?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(10_000_000)
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsEnum(LISTING_CATEGORIES)
  category?: (typeof LISTING_CATEGORIES)[number];

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsUrl(MEDIA_URL_OPTS, { each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  breed?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  age?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  location?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  arabicLocation?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'رقم التواصل غير صالح',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value,
  )
  contactPhone?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50_000)
  @Type(() => Number)
  weightKg?: number;

  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @IsUrl(MEDIA_URL_OPTS)
  videoUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @IsUrl(MEDIA_URL_OPTS)
  thumbnailUrl?: string | null;
}

export class CreateListingCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  content!: string;
}
