import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

const PAYMENT_METHODS = [
  'mada',
  'visa',
  'mastercard',
  'apple_pay',
  'stc_pay',
] as const;
const PAYMENT_TYPES = [
  'subscription',
  'fee',
  'listing_fee',
  'butcher_order',
  'butcher_checkout',
  'commission',
  'order_commission',
] as const;
const BILLING_CYCLES = ['monthly', 'yearly'] as const;

export class InitiatePaymentDto {
  @IsNumber()
  @Min(0.01)
  @Max(100000)
  @Type(() => Number)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsEnum(PAYMENT_METHODS)
  method!: (typeof PAYMENT_METHODS)[number];

  @IsEnum(PAYMENT_TYPES)
  type!: (typeof PAYMENT_TYPES)[number];

  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  descriptionAr?: string;

  /** Plan slug (e.g. sarh-pro, growth). Legacy slugs starter/pro/vip still accepted. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'معرّف الباقة يجب أن يحتوي على أحرف إنجليزية صغيرة وأرقام وشرطات فقط',
  })
  planId?: string;

  @IsOptional()
  @IsEnum(BILLING_CYCLES)
  billingCycle?: (typeof BILLING_CYCLES)[number];

  /** Seller-declared sale amount for listing fee (1%). Required for listing_fee. */
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(10_000_000)
  @Type(() => Number)
  saleAmount?: number;
}
