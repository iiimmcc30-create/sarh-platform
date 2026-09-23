import { apiClient, unwrap } from "./api.client";

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
};

/** Drop empty/invalid list query values so the API receives clean params. */
export function cleanListParams<T extends Record<string, unknown>>(
  params: T,
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (key === "page" || key === "pageSize") {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n) || n < 1) continue;
      out[key] = Math.floor(n);
      continue;
    }
    out[key] = value;
  }
  if (out.page === undefined) out.page = 1;
  return out as Partial<T>;
}

export async function fetchUsers(params: ListParams = {}) {
  const res = await apiClient.get("/admin/users", {
    params: cleanListParams(params),
  });
  return unwrap<Paginated<Record<string, unknown>>>(res);
}

export async function fetchUser(id: string) {
  const res = await apiClient.get(`/admin/users/${id}`);
  return unwrap<{ user: Record<string, unknown> }>(res);
}

export async function updateUser(id: string, data: Record<string, unknown>) {
  const res = await apiClient.patch(`/admin/users/${id}`, data);
  return unwrap(res);
}

export async function deleteUser(id: string) {
  const res = await apiClient.delete(`/admin/users/${id}`);
  return unwrap(res);
}

export async function fetchPosts(
  params: ListParams & { hidden?: string } = {},
) {
  const res = await apiClient.get("/admin/posts", {
    params: cleanListParams(params),
  });
  return unwrap<Paginated<Record<string, unknown>>>(res);
}

export async function setPostHidden(id: string, isHidden: boolean) {
  const res = await apiClient.patch(`/admin/posts/${id}`, { isHidden });
  return unwrap(res);
}

export async function deletePost(id: string) {
  const res = await apiClient.delete(`/admin/posts/${id}`);
  return unwrap(res);
}

export async function fetchListings(
  params: ListParams & { status?: string } = {},
) {
  const res = await apiClient.get("/admin/listings", {
    params: cleanListParams(params),
  });
  return unwrap<Paginated<Record<string, unknown>>>(res);
}

export async function updateListing(id: string, data: Record<string, unknown>) {
  const res = await apiClient.patch(`/admin/listings/${id}`, data);
  return unwrap(res);
}

export type ManagedListingInput = {
  displayUsername: string;
  displaySellerName: string;
  displayPhone: string;
  displayRegion: string;
  category: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  videoUrl?: string | null;
};

export async function createManagedListing(data: ManagedListingInput) {
  const res = await apiClient.post('/admin/listings/managed', data);
  return unwrap(res);
}

export async function updateManagedListing(
  id: string,
  data: Partial<ManagedListingInput>,
) {
  const res = await apiClient.patch(`/admin/listings/${id}/managed`, data);
  return unwrap(res);
}

export async function fetchListingFeeCompliance() {
  const res = await apiClient.get("/admin/listing-fee-compliance");
  return unwrap<{
    users: Array<{
      user: {
        id: string;
        username: string;
        arabicName: string;
        isActive: boolean;
      };
      deletedUnpaidCount: number;
      outstandingTotal: number;
      previousActions: Array<{
        id: string;
        action: string;
        reason: string;
        createdAt: string;
      }>;
    }>;
  }>(res);
}

export async function closeAccountForListingFees(id: string, reason: string) {
  const res = await apiClient.post(
    `/admin/users/${id}/listing-fee-enforcement`,
    { reason },
  );
  return unwrap(res);
}

export async function deleteListing(id: string) {
  const res = await apiClient.delete(`/admin/listings/${id}`);
  return unwrap(res);
}

export async function fetchReports(
  params: ListParams & { status?: string; category?: string } = {},
) {
  const res = await apiClient.get("/admin/reports", {
    params: cleanListParams(params),
  });
  return unwrap<Paginated<Record<string, unknown>>>(res);
}

export async function fetchReport(id: string) {
  const res = await apiClient.get(`/admin/reports/${id}`);
  return unwrap<{ ticket: Record<string, unknown> }>(res);
}

export async function updateReport(id: string, data: Record<string, unknown>) {
  const res = await apiClient.patch(`/admin/reports/${id}`, data);
  return unwrap(res);
}

export async function deleteReport(id: string) {
  const res = await apiClient.delete(`/admin/reports/${id}`);
  return unwrap(res);
}

export async function fetchLiveStreams(
  params: ListParams & { live?: string } = {},
) {
  const res = await apiClient.get("/admin/livestreams", {
    params: cleanListParams(params),
  });
  return unwrap<Paginated<Record<string, unknown>>>(res);
}

export async function stopLiveStream(id: string) {
  const res = await apiClient.post(`/admin/livestreams/${id}`);
  return unwrap(res);
}

export async function deleteLiveStream(id: string) {
  const res = await apiClient.delete(`/admin/livestreams/${id}`);
  return unwrap(res);
}

export async function fetchButchers(params: ListParams = {}) {
  const res = await apiClient.get("/admin/butchers", {
    params: cleanListParams(params),
  });
  return unwrap<Paginated<Record<string, unknown>>>(res);
}

export async function fetchButcher(id: string) {
  const res = await apiClient.get(`/admin/butchers/${id}`);
  return unwrap<{
    butcher: Record<string, unknown>;
    user: Record<string, unknown>;
  }>(res);
}

export async function updateButcher(id: string, data: Record<string, unknown>) {
  const res = await apiClient.patch(`/admin/butchers/${id}`, data);
  return unwrap(res);
}

export async function deleteButcher(id: string) {
  const res = await apiClient.delete(`/admin/butchers/${id}`);
  return unwrap<{ deleted: boolean; archived: boolean }>(res);
}

export async function fetchOrders(
  params: ListParams & {
    status?: string;
    butcherId?: string;
    customerId?: string;
    dateFrom?: string;
    dateTo?: string;
    orderNumber?: string;
  } = {},
) {
  const res = await apiClient.get("/admin/orders", {
    params: cleanListParams(params),
  });
  return unwrap<Paginated<Record<string, unknown>>>(res);
}

export async function fetchOrder(id: string) {
  const res = await apiClient.get(`/admin/orders/${id}`);
  return unwrap<{ order: Record<string, unknown> }>(res);
}

export async function fetchApplications(params: Record<string, string> = {}) {
  const res = await apiClient.get("/admin/butcher-applications", { params });
  return unwrap(res);
}

export async function fetchApplication(id: string) {
  const res = await apiClient.get(`/admin/butcher-applications/${id}`);
  return unwrap<Record<string, unknown>>(res);
}

export async function approveApplication(id: string, comment?: string) {
  const res = await apiClient.post(
    `/admin/butcher-applications/${id}/approve`,
    {
      ...(comment?.trim() ? { comment: comment.trim() } : {}),
    },
  );
  return unwrap(res);
}

export async function rejectApplication(
  id: string,
  rejectionReason: string,
  comment?: string,
) {
  const res = await apiClient.post(`/admin/butcher-applications/${id}/reject`, {
    rejectionReason: rejectionReason.trim(),
    ...(comment?.trim() ? { comment: comment.trim() } : {}),
  });
  return unwrap(res);
}

export async function fetchSettings() {
  const res = await apiClient.get("/admin/settings");
  return unwrap<{ settings: Record<string, unknown>[] }>(res);
}

export async function updateSetting(data: {
  key: string;
  value: unknown;
  labelAr?: string;
  category?: string;
}) {
  const res = await apiClient.put("/admin/settings", data);
  return unwrap(res);
}

export async function fetchSections() {
  const res = await apiClient.get("/admin/sections");
  return unwrap<{ sections: Record<string, unknown>[] }>(res);
}

export async function createSection(data: Record<string, unknown>) {
  const res = await apiClient.post("/admin/sections", data);
  return unwrap(res);
}

export async function updateSection(id: string, data: Record<string, unknown>) {
  const res = await apiClient.patch(`/admin/sections/${id}`, data);
  return unwrap(res);
}

export async function deleteSection(id: string) {
  const res = await apiClient.delete(`/admin/sections/${id}`);
  return unwrap(res);
}

export async function publishSection(
  id: string,
  data?: {
    titleAr?: string;
    bodyAr?: string;
    slug?: string;
    titleEn?: string;
    bodyEn?: string;
    sortOrder?: number;
  },
) {
  const res = await apiClient.post(`/admin/sections/${id}/publish`, data ?? {});
  return unwrap(res);
}

export async function unpublishSection(id: string) {
  const res = await apiClient.post(`/admin/sections/${id}/unpublish`);
  return unwrap(res);
}

export async function fetchSectionVersions(id: string) {
  const res = await apiClient.get(`/admin/sections/${id}/versions`);
  return unwrap<{
    section: Record<string, unknown>;
    versions: Record<string, unknown>[];
  }>(res);
}

export async function restoreSectionVersion(id: string, versionId: string) {
  const res = await apiClient.post(
    `/admin/sections/${id}/restore/${versionId}`,
  );
  return unwrap(res);
}

export async function seedPolicies() {
  const res = await apiClient.post("/content/seed-policies");
  return unwrap(res);
}

// ─── Plans ───────────────────────────────────────────────────────────────────

export type AdminPlan = {
  id: string;
  slug: string;
  name: string;
  description: string;
  audience: "USER" | "BUTCHER";
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  yearlyDiscount: number;
  isActive: boolean;
  sortOrder: number;
  features: Array<{
    id?: string;
    key: string;
    value: string;
    valueType: "BOOLEAN" | "NUMBER" | "STRING" | "JSON";
  }>;
};

export type PlanFeatureCatalogItem = {
  key: string;
  labelAr: string;
  descriptionAr: string;
  valueType: "BOOLEAN" | "NUMBER" | "STRING" | "JSON";
  audiences: Array<"USER" | "BUTCHER">;
  suggestedValue?: string;
};

export async function fetchPlans(audience?: "USER" | "BUTCHER") {
  const res = await apiClient.get("/admin/plans", {
    params: audience ? { audience } : undefined,
  });
  return unwrap<{ plans: AdminPlan[] }>(res);
}

export async function fetchPlan(id: string) {
  const res = await apiClient.get(`/admin/plans/${id}`);
  return unwrap<{ plan: AdminPlan }>(res);
}

export async function fetchPlanFeatureCatalog(audience?: "USER" | "BUTCHER") {
  const res = await apiClient.get("/admin/plans/feature-catalog/list", {
    params: audience ? { audience } : undefined,
  });
  return unwrap<{ features: PlanFeatureCatalogItem[] }>(res);
}

export async function createPlan(data: Record<string, unknown>) {
  const res = await apiClient.post("/admin/plans", data);
  return unwrap(res);
}

export async function updatePlan(id: string, data: Record<string, unknown>) {
  const res = await apiClient.patch(`/admin/plans/${id}`, data);
  return unwrap(res);
}

export async function deactivatePlan(id: string) {
  const res = await apiClient.post(`/admin/plans/${id}/deactivate`);
  return unwrap(res);
}

export async function duplicatePlan(id: string) {
  const res = await apiClient.post(`/admin/plans/${id}/duplicate`);
  return unwrap(res);
}

export async function deletePlan(id: string) {
  const res = await apiClient.delete(`/admin/plans/${id}`);
  return unwrap(res);
}

export type DaftraStatus = {
  butcherId: string;
  status: "NOT_CONFIGURED" | "CONNECTED" | "CONNECTION_FAILED" | "DISABLED";
  accountIdentifier: string | null;
  apiKeyMasked: string | null;
  lastConnectionTestAt: string | null;
  lastConnectionError: string | null;
  daftraLoginEmail: string | null;
  daftraLoginUrl: string | null;
  configured: boolean;
};

export async function fetchDaftraStatus(butcherId: string) {
  const res = await apiClient.get(`/admin/butchers/${butcherId}/daftra`);
  return unwrap<DaftraStatus>(res);
}

export async function saveDaftraConfig(
  butcherId: string,
  data: {
    accountIdentifier: string;
    apiKey?: string;
    daftraLoginEmail?: string | null;
    daftraLoginUrl?: string | null;
  },
) {
  const res = await apiClient.put(`/admin/butchers/${butcherId}/daftra`, data);
  return unwrap<DaftraStatus>(res);
}

export async function testDaftraConnection(
  butcherId: string,
  data: { sendInvite?: boolean; invitePassword?: string } = {},
) {
  const res = await apiClient.post(
    `/admin/butchers/${butcherId}/daftra/test`,
    data,
  );
  return unwrap<{
    status: DaftraStatus;
    messageAr: string;
    connected: boolean;
    reason?: string;
  }>(res);
}

export async function disableDaftra(butcherId: string) {
  const res = await apiClient.post(
    `/admin/butchers/${butcherId}/daftra/disable`,
  );
  return unwrap<DaftraStatus>(res);
}

export type DaftraCatalogProduct = {
  id: number;
  name: string;
  sku: string | null;
  price: number | null;
  quantity: number | null;
};

export async function fetchDaftraProducts(butcherId: string) {
  const res = await apiClient.get(
    `/admin/butchers/${butcherId}/daftra/products`,
    {
      params: { page: 1, limit: 20 },
    },
  );
  return unwrap<{
    items: DaftraCatalogProduct[];
    page: number;
    totalResults: number;
  }>(res);
}

export async function fetchDaftraInventory(butcherId: string) {
  const res = await apiClient.get(
    `/admin/butchers/${butcherId}/daftra/inventory`,
    {
      params: { page: 1, limit: 20 },
    },
  );
  return unwrap<{
    items: Array<{
      productId: number;
      name: string | null;
      quantity: number | null;
    }>;
    totalResults: number;
  }>(res);
}

export type DaftraProductSyncResult = {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  pages: number;
  errors: Array<{ daftraProductId: number | null; message: string }>;
};

export async function syncDaftraProducts(butcherId: string) {
  const res = await apiClient.post(
    `/admin/butchers/${butcherId}/daftra/products/sync`,
  );
  return unwrap<DaftraProductSyncResult>(res);
}
