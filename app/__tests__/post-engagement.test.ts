import { hasInflight, recordPostView, runExclusive } from '@/lib/postEngagement';

jest.mock('@/services/authFetch', () => ({
  authFetch: (input: string, init?: RequestInit) => global.fetch(input, init as RequestInit),
}));

describe('post engagement helpers', () => {
  it('dedupes in-flight exclusive tasks', async () => {
    let started = 0;
    let resolveFirst: (value: string) => void = () => undefined;
    const first = runExclusive(
      'like:p1',
      () =>
        new Promise<string>((resolve) => {
          started += 1;
          resolveFirst = resolve;
        }),
    );
    const second = runExclusive('like:p1', async () => {
      started += 1;
      return 'other';
    });
    expect(hasInflight('like:p1')).toBe(true);
    expect(started).toBe(1);
    resolveFirst('ok');
    await expect(first).resolves.toBe('ok');
    await expect(second).resolves.toBe('ok');
  });

  it('records a view only once per session', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { recorded: true, viewsCount: 12 } }),
    });
    (global as { fetch?: typeof fetch }).fetch = fetchMock as typeof fetch;
    await expect(recordPostView('view-post-session-1')).resolves.toBe(12);
    await expect(recordPostView('view-post-session-1')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
