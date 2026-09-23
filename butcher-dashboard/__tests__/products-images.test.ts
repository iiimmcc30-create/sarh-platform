import { apiClient } from '@/services/api.client';
import { createMyProduct, updateMyProduct } from '@/services/products.service';

jest.mock('@/services/api.client', () => ({
  apiClient: { post: jest.fn(), put: jest.fn() },
  unwrap: (res: { data: { success: boolean; data: unknown } }) => res.data.data,
}));

describe('product image persistence payloads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a product with uploaded image URLs and no client butcherId', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: { success: true, data: { id: 'p1', images: ['https://cdn.example/p.jpg'] } },
    });
    await createMyProduct({
      nameAr: 'لحم',
      nameEn: 'Meat',
      category: 'lamb',
      images: ['https://cdn.example/p.jpg'],
      availableCuts: ['whole'],
      descriptionAr: 'وصف المنتج',
      descriptionEn: 'desc',
      country: 'SA',
    });
    const [path, body] = (apiClient.post as jest.Mock).mock.calls[0];
    expect(path).toBe('/butchers/products');
    expect(body.images).toEqual(['https://cdn.example/p.jpg']);
    expect(body).not.toHaveProperty('butcherId');
  });

  it('replaces and clears product images via PUT without butcherId', async () => {
    (apiClient.put as jest.Mock).mockResolvedValue({
      data: { success: true, data: { id: 'p1', images: [] } },
    });
    await updateMyProduct('p1', {
      images: ['https://cdn.example/replaced.jpg'],
    });
    await updateMyProduct('p1', { images: [] });
    expect(apiClient.put).toHaveBeenNthCalledWith(1, '/butchers/products/p1', {
      images: ['https://cdn.example/replaced.jpg'],
    });
    expect(apiClient.put).toHaveBeenNthCalledWith(2, '/butchers/products/p1', {
      images: [],
    });
  });
});
