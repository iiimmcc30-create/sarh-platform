import { handleButcherApplicationError } from '../../helpers/httpError';
import { ButcherApplicationError } from '../../errors';
import { ApiException } from '../../../common/exceptions/api.exception';

describe('handleButcherApplicationError', () => {
  it('maps domain errors to ApiException', () => {
    expect(() =>
      handleButcherApplicationError(
        null,
        new ButcherApplicationError('APPLICATION_NOT_FOUND'),
      ),
    ).toThrow(ApiException);

    try {
      handleButcherApplicationError(
        null,
        new ButcherApplicationError('APPLICATION_NOT_FOUND'),
      );
    } catch (e) {
      const err = e as ApiException;
      expect(err.status).toBe(404);
      expect(err.error).toBe('APPLICATION_NOT_FOUND');
      expect(err.messageAr).toBe('طلب التقديم غير موجود');
    }
  });

  it('maps unknown errors to server_error 500', () => {
    try {
      handleButcherApplicationError(null, new Error('boom'));
      fail('expected throw');
    } catch (e) {
      const err = e as ApiException;
      expect(err.status).toBe(500);
      expect(err.error).toBe('server_error');
    }
  });
});
