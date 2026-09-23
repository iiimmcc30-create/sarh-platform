import axios from 'axios';
import { getApiErrorMessage, isNoButcherProfileError, unwrap } from '@/services/api.client';
import { isNavActive } from '@/constants/nav';

describe('unwrap', () => {
  it('returns data when success', () => {
    expect(unwrap({ data: { success: true, data: { id: '1' } } })).toEqual({ id: '1' });
  });

  it('throws Arabic message when envelope fails', () => {
    expect(() =>
      unwrap({ data: { success: false, messageAr: 'غير مصرح', error: 'forbidden' } }),
    ).toThrow('غير مصرح');
  });
});

describe('getApiErrorMessage', () => {
  it('maps network errors', () => {
    const err = new axios.AxiosError('Network Error');
    expect(getApiErrorMessage(err)).toBe('تعذّر الاتصال بالخادم');
  });

  it('prefers messageAr from response', () => {
    const err = axios.AxiosError.from(
      new Error('x'),
      undefined,
      undefined,
      undefined,
      {
        status: 400,
        statusText: 'Bad',
        headers: {},
        config: { headers: {} } as never,
        data: { success: false, messageAr: 'بيانات الدخول غير صحيحة', error: 'invalid_credentials' },
      },
    );
    expect(getApiErrorMessage(err)).toBe('بيانات الدخول غير صحيحة');
  });
});

describe('isNoButcherProfileError', () => {
  it('detects 404 not_found from /butchers/me', () => {
    const err = axios.AxiosError.from(
      new Error('x'),
      undefined,
      undefined,
      undefined,
      {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: { headers: {} } as never,
        data: { success: false, error: 'not_found', messageAr: 'الملحمة غير موجودة' },
      },
    );
    expect(isNoButcherProfileError(err)).toBe(true);
  });

  it('does not treat other errors as missing butcher', () => {
    const err = axios.AxiosError.from(
      new Error('x'),
      undefined,
      undefined,
      undefined,
      {
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        config: { headers: {} } as never,
        data: { success: false, error: 'forbidden', messageAr: 'غير مسموح' },
      },
    );
    expect(isNoButcherProfileError(err)).toBe(false);
  });
});

describe('isNavActive', () => {
  it('matches dashboard home exactly', () => {
    expect(isNavActive('/dashboard', '/dashboard')).toBe(true);
    expect(isNavActive('/dashboard/orders', '/dashboard')).toBe(false);
  });

  it('matches nested order routes', () => {
    expect(isNavActive('/dashboard/orders/abc', '/dashboard/orders')).toBe(true);
  });
});
