import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Internal checkout command — not an invented NI payload.
 * NI create-order fields are mapped in NiGatewayAdapter from documented N-Genius API.
 */
export class CreateHostedCheckoutDto {
  @IsUUID('4')
  paymentId!: string;

  @IsString()
  merchantOrderReference!: string;

  @IsNumber()
  @Min(0.01)
  @Max(100000)
  @Type(() => Number)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsString()
  description!: string;

  @IsString()
  redirectUrl!: string;

  @IsString()
  cancelUrl!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  customData?: Record<string, unknown>;
}

export class AdminIntegrationRetryDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  @Type(() => Number)
  force?: number;
}
