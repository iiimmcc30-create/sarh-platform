import {
  mapDaftraProductPage,
  mapDaftraProductStock,
  mapDaftraProductToSarhFields,
} from './daftra.mappers';

describe('daftra.mappers', () => {
  it('maps a paginated product list', () => {
    const page = mapDaftraProductPage({
      result: 'success',
      data: [
        {
          Product: {
            id: 9,
            name: 'لحم',
            product_code: 'SKU-1',
            unit_price: 40,
            stock_balance: 12,
            track_stock: 1,
          },
        },
      ],
      pagination: { page: 1, page_count: 3, total_results: 40 },
    });
    expect(page.items).toEqual([
      {
        id: 9,
        name: 'لحم',
        sku: 'SKU-1',
        price: 40,
        quantity: 12,
        trackStock: true,
        barcode: null,
        description: null,
        saleUnit: null,
      },
    ]);
    expect(page.pageCount).toBe(3);
  });

  it('maps Daftra product sale unit when provided', () => {
    const page = mapDaftraProductPage({
      result: 'success',
      data: [
        {
          Product: {
            id: 10,
            name: 'لحم',
            unit_small_name: 'kg',
            unit_price: 30,
            track_stock: 0,
          },
        },
      ],
      pagination: { page: 1, page_count: 1, total_results: 1 },
    });
    expect(page.items[0]?.saleUnit).toBe('kg');
  });

  it('maps Daftra product into Sarh sync fields', () => {
    const fields = mapDaftraProductToSarhFields({
      id: 9,
      name: 'لحم بقري',
      sku: 'SKU-1',
      price: 40,
      quantity: 12,
      trackStock: true,
      barcode: null,
      description: 'لحم طازج',
      saleUnit: null,
    });
    expect(fields).toMatchObject({
      nameAr: 'لحم بقري',
      nameEn: 'لحم بقري',
      category: 'special_orders',
      priceFixed: 40,
      availableQuantity: 12,
      inStock: true,
      availableCuts: ['عام'],
    });
  });

  it('skips products without a usable name', () => {
    expect(
      mapDaftraProductToSarhFields({
        id: 1,
        name: '  ',
        sku: null,
        price: null,
        quantity: null,
        trackStock: false,
        barcode: null,
        description: null,
        saleUnit: null,
      }),
    ).toBeNull();
  });

  it('maps empty product pages', () => {
    const page = mapDaftraProductPage({
      result: 'success',
      data: [],
      pagination: { page: 1, page_count: 1, total_results: 0 },
    });
    expect(page.items).toEqual([]);
    expect(page.totalResults).toBe(0);
  });

  it('prefers StockLevels for a single product when present', () => {
    const stock = mapDaftraProductStock({
      result: 'success',
      data: {
        Product: {
          id: 4,
          name: 'Item',
          product_code: 'A',
          stock_balance: 100,
          track_stock: 1,
        },
        StockLevels: [
          { store_id: 1, store_name: 'Main', quantity: 10 },
          { store_id: 2, store_name: 'Branch', quantity: 5 },
        ],
      },
    });
    expect(stock?.quantity).toBe(15);
    expect(stock?.source).toBe('stock_levels');
  });
});
