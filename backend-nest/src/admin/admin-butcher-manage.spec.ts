import { updateButcherSchema } from './dto/admin.dto';
import { AdminService } from './admin.service';
import { ApiException } from '../common/exceptions/api.exception';

describe('admin butcher manage', () => {
  const repo = {
    findButcherById: jest.fn(),
    softDeleteButcher: jest.fn(),
    updateButcher: jest.fn(),
    listButchers: jest.fn(),
  };

  let service: AdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminService(
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('updateButcherSchema accepts profile fields used by butcher self-update', () => {
    const parsed = updateButcherSchema.safeParse({
      nameAr: 'ملحمة الاختبار',
      nameEn: 'Test Butcher',
      phone: '+966500000000',
      city: 'Riyadh',
      cityAr: 'الرياض',
      address: 'Street 1 block',
      addressAr: 'شارع ١ حي',
      bioAr: 'وصف',
      logo: 'https://cdn.example.com/logo.png',
      cover: null,
      type: 'verified',
      isOpen: false,
      country: 'SA',
      lat: 24.7,
      lng: 46.7,
    });
    expect(parsed.success).toBe(true);
  });

  it('updateButcherSchema rejects empty patch', () => {
    expect(updateButcherSchema.safeParse({}).success).toBe(false);
  });

  it('deleteButcher soft-deletes when butcher exists', async () => {
    repo.findButcherById.mockResolvedValue({ id: 'b1', nameAr: 'م' });
    repo.softDeleteButcher.mockResolvedValue([]);
    const result = await service.deleteButcher('b1');
    expect(repo.softDeleteButcher).toHaveBeenCalledWith('b1');
    expect(result).toEqual({ deleted: true, archived: true });
  });

  it('deleteButcher 404 when already gone', async () => {
    repo.findButcherById.mockResolvedValue(null);
    await expect(service.deleteButcher('missing')).rejects.toMatchObject({
      status: 404,
      error: 'not_found',
    } satisfies Partial<ApiException>);
    expect(repo.softDeleteButcher).not.toHaveBeenCalled();
  });

  it('updateButcher persists validated fields', async () => {
    repo.findButcherById.mockResolvedValue({ id: 'b1' });
    repo.updateButcher.mockResolvedValue({ id: 'b1', nameAr: 'جديد' });
    const result = await service.updateButcher('b1', { nameAr: 'جديد' });
    expect(repo.updateButcher).toHaveBeenCalledWith('b1', { nameAr: 'جديد' });
    expect(result.butcher).toEqual({ id: 'b1', nameAr: 'جديد' });
  });
});
