import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const REVIEW_COMMENT_MAX = 1000;
export const REVIEW_PAGE_DEFAULT = 15;
export const REVIEW_PAGE_MAX = 30;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateUserReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsBoolean()
  purchased!: boolean;

  @IsBoolean()
  recommend!: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(REVIEW_COMMENT_MAX)
  @Transform(trim)
  comment!: string;

  /** The buyer oath must be explicitly accepted. A missing or false value is rejected. */
  @Equals(true, { message: 'يجب الموافقة على التعهد' })
  oathAccepted!: boolean;
}

export class ListUserReviewsQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(REVIEW_PAGE_MAX)
  limit?: number;
}

export class ReportUserReviewDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @Transform(trim)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(trim)
  details?: string;
}

export class AdminReviewsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  search?: string;

  @IsOptional()
  @IsIn(['all', 'visible', 'hidden'])
  visibility?: 'all' | 'visible' | 'hidden';

  @IsOptional()
  @IsIn(['all', 'yes', 'no'])
  recommend?: 'all' | 'yes' | 'no';
}

export class HideUserReviewDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Transform(trim)
  reason!: string;
}
