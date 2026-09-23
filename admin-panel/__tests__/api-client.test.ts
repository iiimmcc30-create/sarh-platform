import axios from 'axios';
import { getApiErrorMessage, unwrap } from '@/services/api.client';

describe('unwrap', () => {
  it('returns data when success', () => {
    expect(unwrap({ data: { success: true, data: { id: '1' } } })).toEqual({ id: '1' });
  });

  it('throws Arabic message when envelope fails', () => {
    expect(() =>
      unwrap({ data: { success: false, messageAr: 'غير مصرح', error: 'forbidden' } }),
    ).toThrow('غير مصرح');
  });

  it('throws error field when messageAr missing', () => {
    expect(() => unwrap({ data: { success: false, error: 'boom' } })).toThrow('boom');
  });

  it('throws when data is missing even if success', () => {
    expect(() => unwrap({ data: { success: true } })).toThrow('خطأ في الخادم');
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
        data: { success: false, messageAr: 'بيانات غير صالحة', error: 'bad' },
      },
    );
    expect(getApiErrorMessage(err)).toBe('بيانات غير صالحة');
  });

  it('maps generic 500 without Arabic message', () => {
    const err = axios.AxiosError.from(
      new Error('x'),
      undefined,
      undefined,
      undefined,
      {
        status: 500,
        statusText: 'Err',
        headers: {},
        config: { headers: {} } as never,
        data: { success: false },
      },
    );
    expect(getApiErrorMessage(err)).toContain('الخادم غير متاح');
  });

  it('returns Error.message for non-axios errors', () => {
    expect(getApiErrorMessage(new Error('محلي'))).toBe('محلي');
  });

  it('uses fallback for unknown values', () => {
    expect(getApiErrorMessage(null, 'احتياطي')).toBe('احتياطي');
  });
});
