import { apiClient, unwrap } from './api.client';

export type ButcherProfile = {
  id: string;
  userId: string;
  nameAr: string;
  nameEn: string;
  logo: string | null;
  cover: string | null;
  isOpen: boolean;
  phone: string;
  cityAr: string;
  city: string;
  address?: string;
  addressAr?: string;
  bioAr?: string | null;
  bioEn?: string | null;
  specialties?: string[];
  commercialReg?: string | null;
  openTime?: string;
  closeTime?: string;
  closedDays?: string[];
  lat?: number | null;
  lng?: number | null;
  country?: string;
};

export type ButcherSettingsPayload = {
  nameAr?: string;
  nameEn?: string;
  logo?: string | null;
  cover?: string | null;
  bioAr?: string | null;
  bioEn?: string | null;
  specialties?: string[];
  commercialReg?: string | null;
  phone?: string;
  openTime?: string;
  closeTime?: string;
  closedDays?: string[];
  address?: string;
  addressAr?: string;
  city?: string;
  cityAr?: string;
  isOpen?: boolean;
};

export async function fetchMyButcher(): Promise<ButcherProfile> {
  const res = await apiClient.get('/butchers/me');
  return unwrap<ButcherProfile>(res);
}

export async function updateMyButcher(body: ButcherSettingsPayload): Promise<ButcherProfile> {
  const res = await apiClient.put('/butchers/me', body);
  return unwrap<ButcherProfile>(res);
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await apiClient.get('/notifications/unread-count');
  const data = unwrap<{ unreadCount: number }>(res);
  return data.unreadCount;
}
