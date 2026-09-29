import {
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { MessageContentType, MessageThreadType } from '@prisma/client';
import { MEDIA_URL_OPTS } from '../../shared/lib/media-url';
import { VOICE_MAX_DURATION_MS } from '../lib/message-payload';

/** image/*, video/* or audio/* mime (metadata only; the upload step enforces the whitelist). */
export const MESSAGE_MEDIA_MIME_RE = /^(image|video|audio)\/[a-z0-9.+-]+$/i;
/** Hard cap on reported media size metadata (60 MB). */
export const MESSAGE_MEDIA_MAX_BYTES = 60 * 1024 * 1024;

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

  /** Optional explicit kind; legacy clients omit it and it is inferred. */
  @IsOptional()
  @IsEnum(MessageContentType)
  messageType?: MessageContentType;

  @ValidateIf(
    (o: SendMessageDto) => o.messageType === 'VOICE' || o.audioUrl != null,
  )
  @IsDefined()
  @IsUrl(MEDIA_URL_OPTS)
  audioUrl?: string;

  @ValidateIf(
    (o: SendMessageDto) =>
      o.messageType === 'VOICE' || o.audioUrl != null || o.durationMs != null,
  )
  @IsDefined()
  @IsInt()
  @Min(1)
  @Max(VOICE_MAX_DURATION_MS)
  durationMs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(MESSAGE_MEDIA_MIME_RE)
  mediaMimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MESSAGE_MEDIA_MAX_BYTES)
  mediaSizeBytes?: number;
}

export class ContactsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;
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
