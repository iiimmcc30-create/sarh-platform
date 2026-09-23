import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsOurUploadUrl } from '../../users/validators/is-our-upload-url.validator';
import {
  HELP_KINDS,
  SUPPORT_TICKET_CATEGORIES,
} from '../constants/support.constants';

export class TicketAttachmentDto {
  @IsOurUploadUrl()
  fileUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  mimeType?: string;

  @IsOptional()
  fileSizeBytes?: number;
}

export class CreateSupportTicketDto {
  @IsOptional()
  @IsEnum(HELP_KINDS)
  helpKind?: (typeof HELP_KINDS)[number];

  @ValidateIf((o: CreateSupportTicketDto) => !o.helpKind)
  @IsEnum(SUPPORT_TICKET_CATEGORIES)
  category?: (typeof SUPPORT_TICKET_CATEGORIES)[number];

  @ValidateIf((o: CreateSupportTicketDto) => !o.helpKind)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject?: string;

  @ValidateIf((o: CreateSupportTicketDto) => o.helpKind === 'ORDER_HELP')
  @IsUUID()
  orderId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => TicketAttachmentDto)
  attachments?: TicketAttachmentDto[];
}

export class ReplySupportTicketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => TicketAttachmentDto)
  attachments?: TicketAttachmentDto[];
}

export class UpsertVerificationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  nationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  businessType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  additionalInfo?: string;
}

export class VerificationDocumentDto {
  @IsEnum(['NATIONAL_ID', 'COMMERCIAL_REGISTER', 'OTHER'])
  type!: 'NATIONAL_ID' | 'COMMERCIAL_REGISTER' | 'OTHER';

  @IsString()
  @MinLength(1)
  fileKey!: string;

  @IsOurUploadUrl()
  fileUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  originalFileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  mimeType?: string;

  @IsOptional()
  fileSizeBytes?: number;
}
