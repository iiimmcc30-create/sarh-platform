import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddHomeExploreDto {
  @IsString()
  destination!: string;
}

export class UpdateHomeExploreDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class ReorderHomeExploreDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}
