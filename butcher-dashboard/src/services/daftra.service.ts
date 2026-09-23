import { apiClient, unwrap } from './api.client';

export type DaftraOwnerStatus = {
  butcherId: string;
  status: 'NOT_CONFIGURED' | 'CONNECTED' | 'CONNECTION_FAILED' | 'DISABLED';
  accountIdentifier: string | null;
  apiKeyMasked: string | null;
  authMethod?: 'API_KEY' | 'OAUTH' | 'BOTH' | null;
  oauthConnected?: boolean;
  lastConnectionTestAt: string | null;
  lastConnectionError: string | null;
  configured: boolean;
};

export type DaftraCatalogProduct = {
  id: number;
  name: string;
  sku: string | null;
  price: number | null;
  quantity: number | null;
};

export type DaftraInventoryItem = {
  productId: number;
  name: string | null;
  sku: string | null;
  quantity: number | null;
};

export async function fetchMyDaftraStatus() {
  const res = await apiClient.get('/butchers/daftra/status');
  return unwrap<DaftraOwnerStatus>(res);
}

export async function testMyDaftraConnection() {
  const res = await apiClient.post('/butchers/daftra/test-connection');
  return unwrap<{
    status: DaftraOwnerStatus;
    connected: boolean;
    reason?: string;
    messageAr: string;
  }>(res);
}

export async function fetchMyDaftraProducts(page = 1, limit = 20) {
  const res = await apiClient.get('/butchers/daftra/products', {
    params: { page, limit },
  });
  return unwrap<{
    items: DaftraCatalogProduct[];
    page: number;
    pageCount: number;
    totalResults: number;
  }>(res);
}

export async function fetchMyDaftraProduct(id: number) {
  const res = await apiClient.get(`/butchers/daftra/products/${id}`);
  return unwrap<DaftraCatalogProduct>(res);
}

export async function fetchMyDaftraInventory(page = 1, limit = 20) {
  const res = await apiClient.get('/butchers/daftra/inventory', {
    params: { page, limit },
  });
  return unwrap<{
    items: DaftraInventoryItem[];
    page: number;
    totalResults: number;
  }>(res);
}
