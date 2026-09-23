import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export const OFFICIAL_SERVICE_CATEGORIES = [
  'veterinary',
  'livestock',
  'slaughter',
] as const;

export type OfficialServiceCategory =
  (typeof OFFICIAL_SERVICE_CATEGORIES)[number];

const optionalText = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateOfficialServiceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description!: string;

  @IsEnum(OFFICIAL_SERVICE_CATEGORIES)
  category!: OfficialServiceCategory;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  icon!: string;

  @IsUrl({ require_protocol: true })
  externalUrl!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @optionalText()
  feeText?: string;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  steps?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  conditions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  documents?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @optionalText()
  deliveryChannel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateOfficialServiceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @IsOptional()
  @IsEnum(OFFICIAL_SERVICE_CATEGORIES)
  category?: OfficialServiceCategory;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  icon?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  externalUrl?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @optionalText()
  feeText?: string;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  steps?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  conditions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  documents?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @optionalText()
  deliveryChannel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateMinistryProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @optionalText()
  arabicName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @optionalText()
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  about?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImage?: string;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @optionalText()
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @optionalText()
  publicPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @optionalText()
  publicEmail?: string;
}

export class CreateMinistryPostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  image?: string;
}

export class UpdateMinistryPostDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  image?: string;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;
}
