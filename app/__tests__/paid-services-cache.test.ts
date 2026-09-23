import { readFileSync } from 'fs';
import path from 'path';
import {
  DEFAULT_PAID_SERVICE_FLAGS,
  fetchPaidServiceFlags,
  getCachedPaidServiceFlags,
  hasCachedPaidServiceFlags,
  PAID_SERVICES_TTL_MS,
  resetPaidServicesCache,
} from '@/services/paidServices';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

jest.mock('@/services/api', () => ({
  ensureApiReachable: async () => 'https://api.test',
}));

function jsonResponse(body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: () => null },
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
}

function flagsPayload(overrides: Record<string, boolean> = {}) {
  return {
    success: true,
    data: {
      flags: {
        promotionEnabled: true,
        pinEnabled: true,
        featureEnabled: true,
        listingFeesEnabled: true,
        ...overrides,
      },
    },
  };
}

describe('paid-services cache + inflight (P1-05)', () => {
  const originalFetch = global.fetch;
  let now = 1_000_000;

  beforeEach(() => {
    resetPaidServicesCache();
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetPaidServicesCache();
    jest.restoreAllMocks();
  });

  it('keeps hook mount and focus on non-force reload so they share one GET', () => {
    const hook = src('hooks/usePaidServices.ts');
    expect(hook).toContain('void reload()');
    expect(hook).not.toContain('reload(true)');
    expect(hook).toContain('useEffect');
    expect(hook).toContain('useFocusEffect');
    expect(hook).toContain('hasCachedPaidServiceFlags');
    expect(src('services/paidServices.ts')).toContain('PAID_SERVICES_TTL_MS');
    expect(src('services/paidServices.ts')).toContain('60_000');
  });

  it('consumers still use flags / hasAnyBoostService without calling reload', () => {
    const consumers = [
      src('app/listing/[id].tsx'),
      src('app/create/listing.tsx'),
      src('components/listing/ListingBoostSheet.tsx'),
      src('app/promote.tsx'),
      src('app/listing/[id]/promote.tsx'),
    ];
    for (const file of consumers) {
      expect(file).toContain('usePaidServices()');
      expect(file).not.toContain('.reload(');
    }
  });

  it('mount + focus (including legacy force) share one in-flight Promise', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    global.fetch = jest.fn(async () => {
      calls += 1;
      await gate;
      return jsonResponse(flagsPayload({ pinEnabled: false }));
    }) as unknown as typeof fetch;

    const mount = fetchPaidServiceFlags({ force: false });
    const focus = fetchPaidServiceFlags({ force: true });
    expect(mount).toBe(focus);

    release();
    const [a, b] = await Promise.all([mount, focus]);
    expect(a).toEqual(b);
    expect(a.pinEnabled).toBe(false);
    expect(calls).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/api/settings/paid-services',
      { cache: 'no-store' },
    );
  });

  it('focus inside TTL does not hit the network', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(flagsPayload({ featureEnabled: false })),
    ) as unknown as typeof fetch;

    const first = await fetchPaidServiceFlags();
    const again = await fetchPaidServiceFlags();
    expect(first).toEqual(again);
    expect(first.featureEnabled).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(hasCachedPaidServiceFlags()).toBe(true);
  });

  it('focus after TTL revalidates without dropping the previous flags', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(flagsPayload({ promotionEnabled: true })),
    ) as unknown as typeof fetch;
    await fetchPaidServiceFlags();
    expect(getCachedPaidServiceFlags().promotionEnabled).toBe(true);

    now += PAID_SERVICES_TTL_MS + 1;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    global.fetch = jest.fn(async () => {
      await gate;
      return jsonResponse(flagsPayload({ promotionEnabled: false }));
    }) as unknown as typeof fetch;

    const pending = fetchPaidServiceFlags();
    expect(getCachedPaidServiceFlags().promotionEnabled).toBe(true);

    release();
    const next = await pending;
    expect(next.promotionEnabled).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('concurrent callers share the same Promise even when one uses force', async () => {
    global.fetch = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return jsonResponse(flagsPayload({ listingFeesEnabled: false }));
    }) as unknown as typeof fetch;

    const first = fetchPaidServiceFlags();
    const forced = fetchPaidServiceFlags({ force: true });
    const third = fetchPaidServiceFlags();
    expect(first).toBe(forced);
    expect(forced).toBe(third);

    const [a, b, c] = await Promise.all([first, forced, third]);
    expect(a.listingFeesEnabled).toBe(false);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('manual force bypasses TTL after the in-flight request has settled', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(flagsPayload({ pinEnabled: true })),
    ) as unknown as typeof fetch;

    await fetchPaidServiceFlags();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    global.fetch = jest.fn(async () =>
      jsonResponse(flagsPayload({ pinEnabled: false })),
    ) as unknown as typeof fetch;
    const refreshed = await fetchPaidServiceFlags({ force: true });
    expect(refreshed.pinEnabled).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps defaults on error and does not treat them as a fresh cache', async () => {
    global.fetch = jest.fn(async () => jsonResponse({ success: false }, 500)) as unknown as typeof fetch;
    const failed = await fetchPaidServiceFlags();
    expect(failed).toEqual(DEFAULT_PAID_SERVICE_FLAGS);
    expect(hasCachedPaidServiceFlags()).toBe(false);

    global.fetch = jest.fn(async () =>
      jsonResponse(flagsPayload({ listingFeesEnabled: false })),
    ) as unknown as typeof fetch;
    const recovered = await fetchPaidServiceFlags();
    expect(recovered.listingFeesEnabled).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
