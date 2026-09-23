import { registerDecorator, ValidationOptions } from 'class-validator';
import { isOurUploadUrl } from '../../shared/lib/storage';

export function IsOurUploadUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isOurUploadUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && isOurUploadUrl(value);
        },
        defaultMessage() {
          return 'Image must be uploaded via Sarouh upload endpoint';
        },
      },
    });
  };
}
