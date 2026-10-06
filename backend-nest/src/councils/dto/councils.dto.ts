import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export const COUNCIL_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;
export type CouncilVisibilityValue = (typeof COUNCIL_VISIBILITIES)[number];

export const COUNCIL_NAME_MIN = 2;
export const COUNCIL_NAME_MAX = 60;
export const COUNCIL_DESCRIPTION_MAX = 300;
export const COUNCIL_RULES_MAX = 10;
export const COUNCIL_RULE_MAX = 200;
export const COUNCIL_INVITE_BATCH_MAX = 50;

export const COUNCIL_MEMBER_ACTIONS = [
  'promote',
  'demote',
  'mute',
  'unmute',
  'kick',
  'ban',
  'unban',
  'make_moderator',
  'remove_moderator',
] as const;
export type CouncilMemberAction = (typeof COUNCIL_MEMBER_ACTIONS)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Trims each rule and drops empty lines. */
const cleanRules = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value
        .map((r) => (typeof r === 'string' ? r.trim() : r))
        .filter((r) => r !== '')
    : value;

export class CreateCouncilDto {
  @IsString()
  @Transform(trim)
  @MinLength(COUNCIL_NAME_MIN)
  @MaxLength(COUNCIL_NAME_MAX)
  name!: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(COUNCIL_DESCRIPTION_MAX)
  description?: string;

  @IsEnum(COUNCIL_VISIBILITIES)
  visibility!: CouncilVisibilityValue;

  @IsOptional()
  @IsArray()
  @Transform(cleanRules)
  @ArrayMaxSize(COUNCIL_RULES_MAX)
  @IsString({ each: true })
  @MaxLength(COUNCIL_RULE_MAX, { each: true })
  rules?: string[];

  @IsOptional()
  @IsBoolean()
  modCanManageRequests?: boolean;

  @IsOptional()
  @IsBoolean()
  modCanMute?: boolean;

  @IsOptional()
  @IsBoolean()
  modCanRemove?: boolean;

  @IsOptional()
  @IsBoolean()
  modCanBan?: boolean;
}

export class UpdateCouncilDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(COUNCIL_NAME_MIN)
  @MaxLength(COUNCIL_NAME_MAX)
  name?: string;

  /** Empty string clears the description. */
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(COUNCIL_DESCRIPTION_MAX)
  description?: string;

  @IsOptional()
  @IsEnum(COUNCIL_VISIBILITIES)
  visibility?: CouncilVisibilityValue;

  @IsOptional()
  @IsArray()
  @Transform(cleanRules)
  @ArrayMaxSize(COUNCIL_RULES_MAX)
  @IsString({ each: true })
  @MaxLength(COUNCIL_RULE_MAX, { each: true })
  rules?: string[];

  @IsOptional()
  @IsBoolean()
  modCanManageRequests?: boolean;

  @IsOptional()
  @IsBoolean()
  modCanMute?: boolean;

  @IsOptional()
  @IsBoolean()
  modCanRemove?: boolean;

  @IsOptional()
  @IsBoolean()
  modCanBan?: boolean;
}

export class CouncilAccessQueryDto {
  /** Private council invite code (from an invite link). */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{6,32}$/)
  code?: string;
}

export class CouncilsPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;
}

export class JoinCouncilDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{6,32}$/)
  code?: string;

  /** Explicit «قواعد المجلس» acceptance (required on first join when rules exist). */
  @IsOptional()
  @IsBoolean()
  acceptRules?: boolean;
}

export class CouncilMicDto {
  @IsBoolean()
  muted!: boolean;
}

export class CouncilMemberActionDto {
  @IsIn(COUNCIL_MEMBER_ACTIONS)
  action!: CouncilMemberAction;
}

export class InviteCouncilUsersDto {
  @IsArray()
  @ArrayMaxSize(COUNCIL_INVITE_BATCH_MAX)
  @IsUUID('all', { each: true })
  userIds!: string[];
}

export class SearchCouncilUsersQueryDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(60)
  q?: string;
}
