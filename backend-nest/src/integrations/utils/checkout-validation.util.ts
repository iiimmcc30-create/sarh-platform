import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateHostedCheckoutDto } from '../dto/create-hosted-checkout.dto';
import {
  isInternalMerchantOrderReference,
  isNiOrderUuid,
} from '../../payments/ni-client';

export function assertNiFetchUuid(ref: string): void {
  if (!isNiOrderUuid(ref)) {
    const hint = isInternalMerchantOrderReference(ref)
      ? 'internal merchant reference cannot be used as NI order UUID'
      : 'expected UUID';
    throw new Error(`Invalid NI order reference (${hint}): ${ref}`);
  }
}

export function validateCheckoutCommand(
  input: CreateHostedCheckoutDto,
): string[] {
  const instance = plainToInstance(CreateHostedCheckoutDto, input);
  const errors = validateSync(instance, { whitelist: true });
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

export function assertNotInternalRefAsUuid(value: string, field: string): void {
  if (isInternalMerchantOrderReference(value) && !isNiOrderUuid(value)) {
    throw new Error(
      `${field} must be an NI UUID, not Sarh internal reference "${value}"`,
    );
  }
}
