import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
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

export const LISTING_SORT_MODES = ['newest', 'oldest', 'nearest'] as const;
export const LISTING_NEARBY_RADII = [25, 50, 100, 200] as const;
export const LISTING_GEO_SOURCES = ['CITY', 'GPS'] as const;
/** "lat,lng" in decimal degrees, e.g. "26.33,43.97". */
export const NEAR_PARAM_PATTERN =
  /^\s*-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?\s*$/;
export type ListingSortMode = (typeof LISTING_SORT_MODES)[number];

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

  /**
   * Feed order: newest (default, createdAt DESC), oldest (createdAt ASC), or nearest
   * (distance ASC; needs `near` or `cityId`).
   */
  @IsOptional()
  @IsIn(LISTING_SORT_MODES)
  sort?: ListingSortMode;

  /**
   * «القريب منك» origin as "lat,lng". Used only for this query: never stored or logged.
   * With `near` or `cityId`, results are limited to `radiusKm` around the origin, only
   * listings with coordinates are returned, and each carries a rounded `distanceKm`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(48)
  @Matches(NEAR_PARAM_PATTERN, { message: 'near must be "lat,lng"' })
  near?: string;

  /** Origin = this SaudiCity centre (when the viewer picked «مدينتك» instead of GPS). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cityId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn(LISTING_NEARBY_RADII)
  radiusKm?: (typeof LISTING_NEARBY_RADII)[number];
}

/** Optional geo fields on create/update (app city picker). */
class ListingGeoDtoFields {
  /** SaudiCity id from the shared city list. Validated server-side. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cityId?: string;

  /** Only with geoSource=GPS: device point rounded to 2 decimals (~1 km). */
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng?: number;

  @IsOptional()
  @IsIn(LISTING_GEO_SOURCES)
  geoSource?: (typeof LISTING_GEO_SOURCES)[number];
}

export class CreateListingDto extends ListingGeoDtoFields {
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

export class UpdateListingDto extends ListingGeoDtoFields {
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

  /** Reply to this comment (same listing). Omitted / null = top-level comment. */
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}
