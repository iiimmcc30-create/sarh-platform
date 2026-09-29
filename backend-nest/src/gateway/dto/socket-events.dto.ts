import { MessageContentType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { VOICE_MAX_DURATION_MS } from '../../messages/lib/message-payload';

const MEDIA_URL_OPTS = {
  require_tld: false,
  protocols: ['http', 'https'] as ('http' | 'https')[],
};

@ValidatorConstraint({ name: 'textOrMedia', async: false })
export class TextOrMediaConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const obj = args.object as ChatSendDto;
    return !!(obj.text?.trim() || obj.imageUrl || obj.videoUrl || obj.audioUrl);
  }

  defaultMessage(): string {
    return 'text, imageUrl, videoUrl, or audioUrl required';
  }
}

export class ChatSendDto {
  @IsUUID()
  threadId!: string;

  @IsUUID()
  receiverId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsUrl(MEDIA_URL_OPTS)
  imageUrl?: string;

  @IsOptional()
  @IsUrl(MEDIA_URL_OPTS)
  videoUrl?: string;

  @IsOptional()
  @IsEnum(MessageContentType)
  messageType?: MessageContentType;

  @ValidateIf(
    (o: ChatSendDto) => o.messageType === 'VOICE' || o.audioUrl != null,
  )
  @IsDefined()
  @IsUrl(MEDIA_URL_OPTS)
  audioUrl?: string;

  @ValidateIf(
    (o: ChatSendDto) =>
      o.messageType === 'VOICE' || o.audioUrl != null || o.durationMs != null,
  )
  @IsDefined()
  @IsInt()
  @Min(1)
  @Max(VOICE_MAX_DURATION_MS)
  durationMs?: number;

  @Validate(TextOrMediaConstraint)
  private _textOrMedia!: boolean;
}

export class ChatTypingDto {
  @IsUUID()
  threadId!: string;

  @IsUUID()
  receiverId!: string;
}

export class ChatReadDto {
  @IsUUID()
  threadId!: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(50)
  messageIds!: string[];
}

export class LiveCommentDto {
  @IsUUID()
  streamId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message!: string;

  @IsOptional()
  @IsBoolean()
  isOffer?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(10_000_000)
  offerAmount?: number;
}

export class NotificationsReadDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(50)
  ids!: string[];
}

export class SupportJoinDto {
  @IsUUID()
  ticketId!: string;
}

export class SupportSendDto {
  @IsUUID()
  ticketId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}
