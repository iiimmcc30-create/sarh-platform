import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateBadgeVisibilityDto {
  @IsOptional()
  @IsBoolean()
  hideVerifiedBadge?: boolean;

  @IsOptional()
  @IsBoolean()
  hideGoldSellerLabel?: boolean;
}
