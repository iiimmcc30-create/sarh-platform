import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class VerifyStorePurchaseDto {
  @IsIn(['app_store', 'google_play'])
  platform!: 'app_store' | 'google_play';

  @IsString()
  @Matches(/^sa\.sarh\.[a-z0-9._]+$/)
  @MaxLength(100)
  productId!: string;

  /** iOS: StoreKit 2 signed transaction (JWS). Android: purchase token. */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  purchaseToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  transactionId?: string;

  /** Boosts / promotion: the listing the consumable is for. */
  @IsOptional()
  @IsUUID()
  listingId?: string;
}

export class AppleNotificationDto {
  @IsString()
  @MaxLength(60000)
  signedPayload!: string;
}
