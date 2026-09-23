import { fetchButcherCustomers } from '@/services/customers.service';
import { fetchButcherReports } from '@/services/reports.service';
import { updateMyButcher } from '@/services/butcher.service';
import { apiClient } from '@/services/api.client';

jest.mock('@/services/api.client', () => ({
  apiClient: { get: jest.fn(), put: jest.fn() },
  unwrap: (res: { data: { success: boolean; data: unknown } }) => res.data.data,
}));

describe('Phase 4 dashboard clients', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads customers without a client butcherId', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: { items: [], total: 0, page: 1, limit: 20, hasMore: false },
      },
    });
    const getMock = apiClient.get as jest.Mock;
    await fetchButcherCustomers({ page: 1, limit: 20, q: 'أحمد' });
    expect(getMock).toHaveBeenCalledWith('/butchers/customers', {
      params: { page: '1', limit: '20', q: 'أحمد' },
    });
    expect(getMock.mock.calls[0][1].params).not.toHaveProperty('butcherId');
  });

  it('loads reports without a client butcherId', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: { salesTotal: 0, definition: { labelAr: 'x' } },
      },
    });
    const getMock = apiClient.get as jest.Mock;
    await fetchButcherReports({ period: '7d' });
    expect(getMock).toHaveBeenCalledWith('/butchers/reports', {
      params: { period: '7d', from: undefined, to: undefined },
    });
    expect(getMock.mock.calls[0][1].params).not.toHaveProperty('butcherId');
  });

  it('saves settings through PUT /butchers/me', async () => {
    (apiClient.put as jest.Mock).mockResolvedValue({
      data: { success: true, data: { id: 'a', nameAr: 'ملحمة' } },
    });
    await updateMyButcher({ nameAr: 'ملحمة', isOpen: true });
    expect(apiClient.put).toHaveBeenCalledWith('/butchers/me', {
      nameAr: 'ملحمة',
      isOpen: true,
    });
  });

  it('saves logo/cover through PUT /butchers/me without a client butcherId', async () => {
    (apiClient.put as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: { id: 'a', logo: 'https://cdn.example/logo.jpg', cover: null },
      },
    });
    await updateMyButcher({
      logo: 'https://cdn.example/logo.jpg',
      cover: null,
    });
    expect(apiClient.put).toHaveBeenCalledWith('/butchers/me', {
      logo: 'https://cdn.example/logo.jpg',
      cover: null,
    });
    expect(JSON.stringify((apiClient.put as jest.Mock).mock.calls[0][1])).not.toMatch(
      /butcherId/,
    );
  });
});
