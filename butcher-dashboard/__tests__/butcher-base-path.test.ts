import { BUTCHER_BASE_PATH, withButcherBase } from '@/constants/butcherBasePath';

describe('butcher base path helper', () => {
  it('leaves local paths unchanged when base path is empty', () => {
    expect(BUTCHER_BASE_PATH).toBe('');
    expect(withButcherBase('/login')).toBe('/login');
    expect(withButcherBase('/dashboard')).toBe('/dashboard');
  });
});
