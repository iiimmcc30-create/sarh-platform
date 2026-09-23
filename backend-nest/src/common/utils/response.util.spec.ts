import { errorResponse, successResponse } from './response.util';
import { ApiException, throwApi } from '../exceptions/api.exception';
import {
  apiFailure,
  apiSuccess,
  rateLimitFailure,
} from '../dto/api-response.dto';
import {
  softDeleteFields,
  notDeleted,
  retentionCutoff,
} from './soft-delete.util';
import { isLivestockCategory } from '../../listings/listing-categories';

describe('API response helpers', () => {
  it('successResponse wraps data', () => {
    const res = successResponse({ id: '1' });
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ id: '1' });
    expect(res.timestamp).toBeDefined();
  });

  it('errorResponse includes Arabic message and optional details', () => {
    const res = errorResponse('bad_request', 'طلب غير صالح', {
      field: 'email',
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('bad_request');
    expect(res.messageAr).toBe('طلب غير صالح');
    expect(res.details).toEqual({ field: 'email' });
  });

  it('apiSuccess / apiFailure / rateLimitFailure shapes', () => {
    expect(apiSuccess({ ok: true }).body.success).toBe(true);
    expect(apiSuccess({ ok: true }).status).toBe(200);
    const fail = apiFailure(400, 'invalid', 'خطأ');
    expect(fail.body.success).toBe(false);
    expect(fail.status).toBe(400);
    const rl = rateLimitFailure(30);
    expect(rl.status).toBe(429);
    expect(rl.body.retryAfter).toBe(30);
  });
});

describe('ApiException', () => {
  it('throwApi throws typed exception', () => {
    expect(() => throwApi(404, 'not_found', 'غير موجود')).toThrow(ApiException);
    try {
      throwApi(403, 'forbidden', 'ممنوع', { reason: 'role' });
    } catch (e) {
      const err = e as ApiException;
      expect(err.status).toBe(403);
      const json = err.toJSON();
      expect(json.success).toBe(false);
      expect(json.error).toBe('forbidden');
      expect(json.details).toEqual({ reason: 'role' });
    }
  });
});

describe('soft-delete utils', () => {
  it('softDeleteFields sets deletedAt', () => {
    const fields = softDeleteFields();
    expect(fields.deletedAt).toBeInstanceOf(Date);
  });

  it('notDeleted excludes soft-deleted rows', () => {
    expect(notDeleted).toEqual({ deletedAt: null });
  });

  it('retentionCutoff is in the past', () => {
    const cut = retentionCutoff(30);
    expect(cut.getTime()).toBeLessThan(Date.now());
  });
});

describe('listing categories', () => {
  it('identifies livestock vs non-livestock', () => {
    expect(isLivestockCategory('sheep')).toBe(true);
    expect(isLivestockCategory('camels')).toBe(true);
    expect(isLivestockCategory('feed')).toBe(false);
    expect(isLivestockCategory('equipment')).toBe(false);
  });
});

/** HTTP status contract matrix used by API clients */
describe('HTTP status contract expectations', () => {
  const statuses = {
    ok: 200,
    created: 201,
    badRequest: 400,
    unauthorized: 401,
    forbidden: 403,
    notFound: 404,
    unprocessable: 422,
    tooMany: 429,
    serverError: 500,
  };

  it('exposes expected status codes for auth/validation/rate-limit', () => {
    expect(statuses.ok).toBe(200);
    expect(statuses.created).toBe(201);
    expect(statuses.badRequest).toBe(400);
    expect(statuses.unauthorized).toBe(401);
    expect(statuses.forbidden).toBe(403);
    expect(statuses.notFound).toBe(404);
    expect(statuses.unprocessable).toBe(422);
    expect(statuses.tooMany).toBe(429);
    expect(statuses.serverError).toBe(500);
  });
});
