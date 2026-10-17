import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map } from 'rxjs/operators';
import { serializeMoneyTree } from '../money';

/**
 * Prisma returns money columns as Decimal. JSON.stringify would emit a string
 * via Decimal#toJSON and surprise clients that already read amounts as numbers.
 * This converts every Decimal in the response body to a 2-decimal JSON number.
 */
@Injectable()
export class MoneySerializationInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map((data) => serializeMoneyTree(data)));
  }
}
