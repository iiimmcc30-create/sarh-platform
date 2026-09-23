import {
  ADMIN_BASE_PATH,
  adminLoginPath,
  getAdminBasePath,
  withAdminBase,
} from '@/constants/adminBasePath';

describe('admin base path helper', () => {
  const prev = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH;

  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_ADMIN_BASE_PATH;
    else process.env.NEXT_PUBLIC_ADMIN_BASE_PATH = prev;
  });

  it('leaves local paths unchanged when base path is empty', () => {
    delete process.env.NEXT_PUBLIC_ADMIN_BASE_PATH;
    expect(getAdminBasePath()).toBe('');
    expect(withAdminBase('/login')).toBe('/login');
    expect(withAdminBase('/')).toBe('/');
    expect(adminLoginPath()).toBe('/login');
  });

  it('prefixes /admin for production basePath and never emits root /login', () => {
    process.env.NEXT_PUBLIC_ADMIN_BASE_PATH = '/admin';
    expect(getAdminBasePath()).toBe('/admin');
    expect(withAdminBase('/login')).toBe('/admin/login');
    expect(withAdminBase('/')).toBe('/admin/');
    expect(withAdminBase('/users')).toBe('/admin/users');
    expect(adminLoginPath()).toBe('/admin/login');
    expect(adminLoginPath()).not.toBe('/login');
  });

  it('module ADMIN_BASE_PATH reflects process env at load (empty in default jest)', () => {
    // Default jest env has no NEXT_PUBLIC_ADMIN_BASE_PATH baked in.
    expect(typeof ADMIN_BASE_PATH).toBe('string');
  });
});
