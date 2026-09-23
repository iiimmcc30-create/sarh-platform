import {
  mapPrismaUniqueViolation,
  ButcherApplicationError,
} from '../../errors';

describe('mapPrismaUniqueViolation', () => {
  it('maps butcher userId violation', () => {
    const err = {
      code: 'P2002',
      meta: { modelName: 'Butcher', target: ['userId'] },
    };
    const mapped = mapPrismaUniqueViolation(err);
    expect(mapped?.code).toBe('BUTCHER_ALREADY_EXISTS');
  });

  it('maps one draft per user partial unique', () => {
    const err = {
      code: 'P2002',
      meta: {
        modelName: 'ButcherApplication',
        target: ['userId'],
        constraint: 'ButcherApplication_one_draft_per_user_key',
      },
    };
    const mapped = mapPrismaUniqueViolation(err);
    expect(mapped?.code).toBe('ACTIVE_DRAFT_EXISTS');
  });

  it('maps one submitted per user partial unique', () => {
    const err = {
      code: 'P2002',
      meta: {
        modelName: 'ButcherApplication',
        target: ['userId'],
        constraint: 'one_submitted_per_user',
      },
      message: 'unique constraint one_submitted_per_user',
    };
    const mapped = mapPrismaUniqueViolation(err);
    expect(mapped?.code).toBe('ACTIVE_SUBMITTED_EXISTS');
  });

  it('maps duplicate document type', () => {
    const err = {
      code: 'P2002',
      meta: {
        modelName: 'ButcherApplicationDocument',
        target: ['applicationId', 'type'],
      },
    };
    const mapped = mapPrismaUniqueViolation(err);
    expect(mapped?.code).toBe('DOCUMENT_TYPE_ALREADY_EXISTS');
  });

  it('maps duplicate user login credentials', () => {
    const err = {
      code: 'P2002',
      meta: { modelName: 'User', target: ['username'] },
    };
    const mapped = mapPrismaUniqueViolation(err);
    expect(mapped?.code).toBe('ACCOUNT_CREDENTIALS_TAKEN');
    expect(mapped?.httpStatus).toBe(409);
  });

  it('returns null for non-unique errors', () => {
    expect(mapPrismaUniqueViolation({ code: 'P2025' })).toBeNull();
    expect(mapPrismaUniqueViolation(new Error('other'))).toBeNull();
  });

  it('exposes Phase C http status on mapped errors', () => {
    const mapped = mapPrismaUniqueViolation({
      code: 'P2002',
      meta: {
        modelName: 'ButcherApplicationDocument',
        target: ['applicationId', 'type'],
      },
    });
    expect(mapped).toBeInstanceOf(ButcherApplicationError);
    expect(mapped?.httpStatus).toBe(409);
  });
});
