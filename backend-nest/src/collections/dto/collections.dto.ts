import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsOurUploadUrl } from '../../users/validators/is-our-upload-url.validator';
import { IsMediaUrl } from '../../shared/lib/media-url';

export const COLLECTION_TYPES = ['POSTS', 'ADS'] as const;
export type CollectionTypeValue = (typeof COLLECTION_TYPES)[number];

export const COLLECTION_NAME_MIN = 2;
export const COLLECTION_NAME_MAX = 60;
export const COLLECTION_DESCRIPTION_MAX = 300;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCollectionDto {
  @IsString()
  @Transform(trim)
  @MinLength(COLLECTION_NAME_MIN)
  @MaxLength(COLLECTION_NAME_MAX)
  name!: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(COLLECTION_DESCRIPTION_MAX)
  description?: string;

  @IsOptional()
  @IsMediaUrl()
  @IsOurUploadUrl()
  coverUrl?: string;

  @IsEnum(COLLECTION_TYPES)
  type!: CollectionTypeValue;
}

export class UpdateCollectionDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(COLLECTION_NAME_MIN)
  @MaxLength(COLLECTION_NAME_MAX)
  name?: string;

  /** Empty string clears the description. */
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(COLLECTION_DESCRIPTION_MAX)
  description?: string;

  /** `null` removes the cover. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsMediaUrl()
  @IsOurUploadUrl()
  coverUrl?: string | null;

  @IsOptional()
  @IsEnum(COLLECTION_TYPES)
  type?: CollectionTypeValue;
}

export class CollectionsPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;
}

export class SearchCollectionsQueryDto extends CollectionsPageQueryDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(COLLECTION_NAME_MAX)
  q?: string;
}

export class SearchCollectionUsersQueryDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(60)
  q?: string;

  /** Marks users already in this collection (`isMember`). */
  @IsOptional()
  @IsUUID()
  collectionId?: string;
}

export class AddCollectionMemberDto {
  @IsUUID()
  userId!: string;
}
