import { IsNumber, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListingFeeQuoteDto {
  @IsUUID()
  listingId!: string;

  @IsNumber()
  @Min(0.01)
  @Max(10_000_000)
  @Type(() => Number)
  saleAmount!: number;
}
