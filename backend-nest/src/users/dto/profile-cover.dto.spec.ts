import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateUserDto } from './users.dto';

const errors = (body: object) =>
  validateSync(plainToInstance(UpdateUserDto, body)).map((e) => e.property);

describe('UpdateUserDto profile cover', () => {
  it('accepts an uploaded cover URL (set / replace)', () => {
    expect(
      errors({
        coverImage:
          'https://res.cloudinary.com/demo/image/upload/v1/avatars/cover.jpg',
      }),
    ).toEqual([]);
  });

  it('accepts null to remove the cover (back to the default)', () => {
    expect(errors({ coverImage: null })).toEqual([]);
  });

  it('rejects a non-URL cover', () => {
    expect(errors({ coverImage: 'not a url' })).toContain('coverImage');
  });
});
