import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateExploreSarhBannerDto {
  @IsString()
  @MinLength(4)
  @MaxLength(2000)
  @Transform(trim)
  imageUrl!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(trim)
  accessibilityLabel!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/^\/[A-Za-z0-9/_()-]*$/, {
    message: 'href must be an in-app path starting with /',
  })
  @Transform(trim)
  href!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateExploreSarhBannerDto {
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(2000)
  @Transform(trim)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(trim)
  accessibilityLabel?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/^\/[A-Za-z0-9/_()-]*$/, {
    message: 'href must be an in-app path starting with /',
  })
  @Transform(trim)
  href?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class ReorderExploreSarhBannersDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}
