import { feeCheckJobId } from './job-id';

describe('feeCheckJobId', () => {
  it('does not contain colons and stays unique per listing fee', () => {
    const id = feeCheckJobId('11111111-1111-4111-8111-111111111111');
    expect(id.includes(':')).toBe(false);
    expect(id).toBe('fee-11111111-1111-4111-8111-111111111111');
    expect(feeCheckJobId('aaa')).not.toBe(feeCheckJobId('bbb'));
  });
});
