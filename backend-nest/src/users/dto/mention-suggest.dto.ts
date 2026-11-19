import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MentionSuggestQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  q?: string;
}
