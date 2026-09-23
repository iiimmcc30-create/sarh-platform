import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiSuccessResponseDto<T = unknown> {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty()
  data!: T;

  @ApiProperty({ example: '2026-07-05T00:00:00.000Z' })
  timestamp!: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ example: 'validation_error' })
  error!: string;

  @ApiProperty({ example: 'بيانات غير صحيحة' })
  messageAr!: string;

  @ApiPropertyOptional()
  details?: unknown;

  @ApiProperty({ example: '2026-07-05T00:00:00.000Z' })
  timestamp!: string;
}

export class RateLimitErrorDto {
  @ApiProperty({ example: 'too_many_requests' })
  error!: string;

  @ApiProperty({ example: 'طلبات كثيرة جداً، حاول لاحقاً' })
  messageAr!: string;

  @ApiProperty({ example: 'Too many requests, please try again later' })
  message!: string;

  @ApiProperty({ example: 900 })
  retryAfter!: number;
}

export function apiSuccess<T>(data: T, status = 200) {
  return {
    status,
    body: {
      success: true as const,
      data,
      timestamp: new Date().toISOString(),
    },
  };
}

export function apiFailure(
  status: number,
  error: string,
  messageAr: string,
  details?: unknown,
) {
  return {
    status,
    body: {
      success: false as const,
      error,
      messageAr,
      ...(details !== undefined ? { details } : {}),
      timestamp: new Date().toISOString(),
    },
  };
}

export function rateLimitFailure(retryAfterSec: number) {
  return {
    status: 429,
    body: {
      error: 'too_many_requests',
      messageAr: 'طلبات كثيرة جداً، حاول لاحقاً',
      message: 'Too many requests, please try again later',
      retryAfter: retryAfterSec,
    },
  };
}
