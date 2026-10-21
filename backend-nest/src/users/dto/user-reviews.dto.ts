import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
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

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateUserReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsBoolean()
  purchased!: boolean;

  @IsBoolean()
  recommend!: boolean;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(REVIEW_COMMENT_MAX)
  comment!: string;

  /** Must be the literal true — a missing or false oath is rejected. */
  @Equals(true)
  oathAccepted!: true;
}

export class ListUserReviewsQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number;
}

export class ReportUserReviewDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  reason!: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(1000)
  details?: string;
}
