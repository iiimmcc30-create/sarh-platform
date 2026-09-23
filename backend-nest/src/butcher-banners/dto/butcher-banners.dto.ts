import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateButcherBannerDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @ValidateIf((_, v) => typeof v === 'string' && v.length > 0)
  @MinLength(2)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  titleAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ValidateIf((_, v) => typeof v === 'string' && v.length > 0)
  @MinLength(2)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  subtitleAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  captionAr?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  slot?: number;
}
