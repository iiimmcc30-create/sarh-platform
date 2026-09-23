import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PlanAudience } from '@prisma/client';

export class PlanFeatureDto {
  @IsString()
  @MaxLength(100)
  key!: string;

  @IsString()
  @MaxLength(5000)
  value!: string;

  @IsEnum(['BOOLEAN', 'NUMBER', 'STRING', 'JSON'])
  valueType!: 'BOOLEAN' | 'NUMBER' | 'STRING' | 'JSON';
}

export class CreatePlanDto {
  @IsString()
  @MaxLength(80)
  slug!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(PlanAudience)
  audience!: PlanAudience;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  monthlyPrice!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  yearlyPrice!: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  yearlyDiscount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureDto)
  features?: PlanFeatureDto[];
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(PlanAudience)
  audience?: PlanAudience;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  monthlyPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  yearlyPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  yearlyDiscount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureDto)
  features?: PlanFeatureDto[];
}

export class UpdatePlanFeaturesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureDto)
  features!: PlanFeatureDto[];
}
