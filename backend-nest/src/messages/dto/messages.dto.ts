import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { MessageThreadType } from '@prisma/client';
import { MEDIA_URL_OPTS } from '../../shared/lib/media-url';

export class ListThreadsQueryDto {
  @IsOptional()
  @IsEnum(MessageThreadType)
  type?: MessageThreadType;
}

export class SendMessageDto {
  @IsUUID()
  receiverId!: string;

  @IsOptional()
  @IsEnum(MessageThreadType)
  type?: MessageThreadType;

  @ValidateIf((o: SendMessageDto) => o.type === 'BUTCHER' || !!o.butcherId)
  @IsUUID()
  butcherId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  text?: string;

  @IsOptional()
  @IsUrl(MEDIA_URL_OPTS)
  imageUrl?: string;

  @IsOptional()
  @IsUrl(MEDIA_URL_OPTS)
  videoUrl?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;
}

export class ThreadMessagesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class PinThreadDto {
  @IsBoolean()
  pinned!: boolean;
}
