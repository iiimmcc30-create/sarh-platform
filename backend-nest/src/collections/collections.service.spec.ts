import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PATH_METADATA } from '@nestjs/common/constants';
import {
  AddCollectionMemberDto,
  CreateCollectionDto,
  UpdateCollectionDto,
} from './dto/collections.dto';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

function errorsOf<T extends object>(cls: new () => T, body: object) {
  return validateSync(plainToInstance(cls, body)).map((e) => e.property);
}

describe('collections DTOs', () => {
  it('requires a trimmed name and a POSTS|ADS type', () => {
    expect(
      errorsOf(CreateCollectionDto, { name: 'إبل', type: 'POSTS' }),
    ).toEqual([]);
    expect(
      errorsOf(CreateCollectionDto, { name: '   ', type: 'ADS' }),
    ).toContain('name');
    expect(
      errorsOf(CreateCollectionDto, { name: 'إبل', type: 'LISTS' }),
    ).toContain('type');
    expect(errorsOf(CreateCollectionDto, { name: 'إبل' })).toContain('type');
    expect(
      errorsOf(CreateCollectionDto, {
        name: 'إبل',
        type: 'ADS',
        description: 'x'.repeat(301),
      }),
    ).toContain('description');
  });

  it('update accepts null cover (remove) and partial bodies', () => {
    expect(errorsOf(UpdateCollectionDto, { coverUrl: null })).toEqual([]);
    expect(errorsOf(UpdateCollectionDto, {})).toEqual([]);
    expect(errorsOf(UpdateCollectionDto, { coverUrl: 'not a url' })).toContain(
      'coverUrl',
    );
  });

  it('member body needs a user uuid', () => {
    expect(errorsOf(AddCollectionMemberDto, { userId: 'abc' })).toContain(
      'userId',
    );
  });
});

describe('CollectionsController', () => {
  it('declares static routes before :id', () => {
    const proto = CollectionsController.prototype as unknown as Record<
      string,
      object
    >;
    const paths = Object.getOwnPropertyNames(proto)
      .filter((name) => name !== 'constructor')
      .map((name) => Reflect.getMetadata(PATH_METADATA, proto[name]) as string);
    const firstParam = paths.findIndex((p) => p.startsWith(':id'));
    for (const fixed of [
      'suggested',
      'mine',
      'search',
      'member-of/:userId',
      'users/search',
    ]) {
      expect(paths.indexOf(fixed)).toBeGreaterThanOrEqual(0);
      expect(paths.indexOf(fixed)).toBeLessThan(firstParam);
    }
  });
});

describe('CollectionsService authorization', () => {
  const owner = { userId: 'owner-1' } as JwtPayload;
  const stranger = { userId: 'user-2' } as JwtPayload;
  const prisma = {
    collection: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    collectionMember: { create: jest.fn(), deleteMany: jest.fn() },
  };
  const service = new CollectionsService(
    prisma as never,
    { findBlockedRelationshipIds: jest.fn().mockResolvedValue([]) } as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.collection.findUnique.mockResolvedValue({
      id: 'c1',
      ownerId: owner.userId,
      type: 'POSTS',
    });
  });

  it.each([
    ['update', () => service.update(stranger, 'c1', { name: 'x' })],
    ['remove', () => service.remove(stranger, 'c1')],
    [
      'addMember',
      () =>
        service.addMember(stranger, 'c1', {
          userId: '00000000-0000-4000-8000-000000000001',
        }),
    ],
    ['removeMember', () => service.removeMember(stranger, 'c1', 'u')],
  ])('%s by a non-owner is 403 and writes nothing', async (_name, run) => {
    await expect(run()).rejects.toMatchObject({
      status: 403,
      error: 'forbidden',
    });
    expect(prisma.collection.update).not.toHaveBeenCalled();
    expect(prisma.collection.delete).not.toHaveBeenCalled();
    expect(prisma.collectionMember.create).not.toHaveBeenCalled();
    expect(prisma.collectionMember.deleteMany).not.toHaveBeenCalled();
  });

  it('missing collection is 404', async () => {
    prisma.collection.findUnique.mockResolvedValue(null);
    await expect(service.remove(owner, 'nope')).rejects.toMatchObject({
      status: 404,
    });
  });
});
