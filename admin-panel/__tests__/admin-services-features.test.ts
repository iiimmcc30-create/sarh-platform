/**
 * Feature → API contract smoke tests for every admin domain.
 * Mocks apiClient so each section's service methods hit the expected path.
 */
import { apiClient } from "@/services/api.client";
import * as admin from "@/services/admin.service";
import * as dashboard from "@/services/dashboard.service";
import * as support from "@/services/support.service";
import * as editorial from "@/services/editorial-stories.service";
import * as butcherBanners from "@/services/butcher-banners.service";
import * as exploreSarhBanners from "@/services/explore-sarh-banners.service";
import * as knowledge from "@/services/knowledge.service";
import * as official from "@/services/official-services.service";
import * as ministry from "@/services/ministry.service";
import * as auth from "@/services/auth.service";

jest.mock("@/services/api.client", () => {
  const actual = jest.requireActual("@/services/api.client");
  return {
    ...actual,
    apiClient: {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    },
  };
});

const ok = <T>(data: T) => ({ data: { success: true, data } });

beforeEach(() => {
  jest.clearAllMocks();
  (apiClient.get as jest.Mock).mockResolvedValue(ok({}));
  (apiClient.post as jest.Mock).mockResolvedValue(ok({}));
  (apiClient.patch as jest.Mock).mockResolvedValue(ok({}));
  (apiClient.put as jest.Mock).mockResolvedValue(ok({}));
  (apiClient.delete as jest.Mock).mockResolvedValue(ok({}));
});

describe("admin feature API wiring — login to every section", () => {
  it("login posts credentials", async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce(
      ok({
        user: { id: "1", role: "ADMIN", arabicName: "أ" },
        accessToken: "a",
        refreshToken: "r",
      }),
    );
    await auth.adminLogin("admin", "secret");
    expect(apiClient.post).toHaveBeenCalledWith("/admin/auth/login", {
      login: "admin",
      password: "secret",
    });
  });

  it("dashboard stats", async () => {
    await dashboard.fetchDashboardStats();
    expect(apiClient.get).toHaveBeenCalledWith("/admin/dashboard/stats");
  });

  it("users list + detail + update", async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce(
        ok({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
      )
      .mockResolvedValueOnce(ok({ user: { id: "u1" } }));
    await admin.fetchUsers({ page: 1, search: "ahmad" });
    await admin.fetchUser("u1");
    await admin.updateUser("u1", { role: "USER" });
    expect(apiClient.get).toHaveBeenCalledWith(
      "/admin/users",
      expect.any(Object),
    );
    expect(apiClient.get).toHaveBeenCalledWith("/admin/users/u1");
    expect(apiClient.patch).toHaveBeenCalledWith("/admin/users/u1", {
      role: "USER",
    });
  });

  it("posts moderation", async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce(
      ok({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    );
    await admin.fetchPosts({ hidden: "true" });
    await admin.setPostHidden("p1", true);
    await admin.deletePost("p1");
    expect(apiClient.get).toHaveBeenCalledWith(
      "/admin/posts",
      expect.any(Object),
    );
    expect(apiClient.patch).toHaveBeenCalledWith("/admin/posts/p1", {
      isHidden: true,
    });
    expect(apiClient.delete).toHaveBeenCalledWith("/admin/posts/p1");
  });

  it("listings (ads)", async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce(
      ok({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    );
    await admin.fetchListings({ status: "ACTIVE" });
    await admin.updateListing("l1", { status: "HIDDEN" });
    await admin.deleteListing("l1");
    expect(apiClient.get).toHaveBeenCalledWith(
      "/admin/listings",
      expect.any(Object),
    );
  });

  it("reports", async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce(
        ok({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
      )
      .mockResolvedValueOnce(ok({ ticket: { id: "r1" } }));
    await admin.fetchReports({ status: "OPEN" });
    await admin.fetchReport("r1");
    await admin.updateReport("r1", { status: "RESOLVED" });
    expect(apiClient.get).toHaveBeenCalledWith("/admin/reports/r1");
  });

  it("live streams", async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce(
      ok({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    );
    await admin.fetchLiveStreams({ live: "true" });
    await admin.stopLiveStream("ls1");
    await admin.deleteLiveStream("ls1");
    expect(apiClient.post).toHaveBeenCalledWith("/admin/livestreams/ls1");
  });

  it("butchers + applications", async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce(
        ok({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
      )
      .mockResolvedValueOnce(ok({ butcher: {}, user: {} }))
      .mockResolvedValueOnce(ok({ items: [] }))
      .mockResolvedValueOnce(ok({ id: "app1" }));
    await admin.fetchButchers();
    await admin.fetchButcher("b1");
    await admin.updateButcher("b1", { nameAr: "ملحمة", isOpen: false });
    await admin.deleteButcher("b1");
    await admin.fetchApplications({ status: "PENDING" });
    await admin.fetchApplication("app1");
    await admin.approveApplication("app1", "ok");
    await admin.rejectApplication("app1", "incomplete");
    expect(apiClient.patch).toHaveBeenCalledWith(
      "/admin/butchers/b1",
      expect.objectContaining({ nameAr: "ملحمة" }),
    );
    expect(apiClient.delete).toHaveBeenCalledWith("/admin/butchers/b1");
    expect(apiClient.post).toHaveBeenCalledWith(
      "/admin/butcher-applications/app1/approve",
      expect.any(Object),
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      "/admin/butcher-applications/app1/reject",
      expect.objectContaining({ rejectionReason: "incomplete" }),
    );
  });

  it("orders", async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce(
        ok({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
      )
      .mockResolvedValueOnce(ok({ order: { id: "o1" } }));
    await admin.fetchOrders({ status: "pending" });
    await admin.fetchOrder("o1");
    expect(apiClient.get).toHaveBeenCalledWith("/admin/orders/o1");
  });

  it("plans (payments/subscriptions)", async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce(ok({ plans: [] }))
      .mockResolvedValueOnce(ok({ plan: { id: "pl1" } }))
      .mockResolvedValueOnce(ok({ features: [] }));
    await admin.fetchPlans("USER");
    await admin.fetchPlan("pl1");
    await admin.fetchPlanFeatureCatalog("USER");
    await admin.createPlan({ slug: "x" });
    await admin.updatePlan("pl1", { monthlyPrice: 10 });
    await admin.deactivatePlan("pl1");
    await admin.duplicatePlan("pl1");
    await admin.deletePlan("pl1");
    expect(apiClient.get).toHaveBeenCalledWith("/admin/plans", {
      params: { audience: "USER" },
    });
  });

  it("content / policies / settings", async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce(ok({ sections: [] }))
      .mockResolvedValueOnce(ok({ settings: [] }));
    await admin.fetchSections();
    await admin.createSection({ titleAr: "ت" });
    await admin.publishSection("s1");
    await admin.unpublishSection("s1");
    await admin.fetchSettings();
    await admin.updateSetting({ key: "k", value: true });
    expect(apiClient.put).toHaveBeenCalledWith(
      "/admin/settings",
      expect.any(Object),
    );
  });

  it("support tickets / verification / faqs", async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce(
        ok({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
      )
      .mockResolvedValueOnce(ok({ ticket: { id: "t1" } }))
      .mockResolvedValueOnce(
        ok({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
      )
      .mockResolvedValueOnce(ok({ request: { id: "v1" } }))
      .mockResolvedValueOnce(ok({ faqs: [] }));
    await support.fetchSupportTickets({ status: "OPEN" });
    await support.fetchSupportTicket("t1");
    await support.replySupportTicket("t1", { body: "رد" });
    await support.fetchVerificationRequests();
    await support.fetchVerificationRequest("v1");
    await support.updateVerificationRequest("v1", { status: "VERIFIED" });
    await support.fetchSupportFaqs();
    await support.createSupportFaq({ questionAr: "؟" });
    expect(apiClient.get).toHaveBeenCalledWith(
      "/admin/support/tickets",
      expect.any(Object),
    );
    expect(apiClient.get).toHaveBeenCalledWith(
      "/admin/support/verification",
      expect.any(Object),
    );
    expect(apiClient.get).toHaveBeenCalledWith(
      "/admin/support/faqs",
      expect.any(Object),
    );
  });

  it("editorial stories", async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce(ok({ stories: [] }));
    await editorial.fetchEditorialStoriesAdmin();
    await editorial.createEditorialStory({
      bodyAr: "نص",
      imageUrl: "https://cdn.example/a.jpg",
    });
    await editorial.updateEditorialStory("s1", { isActive: false });
    await editorial.deleteEditorialStory("s1");
    expect(apiClient.get).toHaveBeenCalledWith("/admin/editorial-stories");
    expect(apiClient.post).toHaveBeenCalledWith(
      "/admin/editorial-stories",
      expect.any(Object),
    );
  });

  it("butcher market banners", async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce(ok({ banners: [] }));
    await butcherBanners.fetchButcherBannersAdmin();
    await butcherBanners.updateButcherBanner("b1", { titleAr: "عنوان" });
    expect(apiClient.get).toHaveBeenCalledWith("/admin/butcher-banners");
    expect(apiClient.patch).toHaveBeenCalledWith("/admin/butcher-banners/b1", {
      titleAr: "عنوان",
    });
  });

  it("explore sarh banners", async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce(ok({ banners: [] }));
    (apiClient.post as jest.Mock).mockResolvedValueOnce(
      ok({
        banner: {
          id: "e1",
          imageUrl: "https://cdn.example/e.jpg",
          accessibilityLabel: "ملاحم",
          href: "/butchers",
          sortOrder: 0,
          isActive: true,
        },
      }),
    );
    await exploreSarhBanners.fetchExploreSarhBannersAdmin();
    await exploreSarhBanners.createExploreSarhBanner({
      imageUrl: "https://cdn.example/e.jpg",
      accessibilityLabel: "ملاحم",
      href: "/butchers",
    });
    await exploreSarhBanners.updateExploreSarhBanner("e1", { isActive: false });
    await exploreSarhBanners.reorderExploreSarhBanners(["e1"]);
    await exploreSarhBanners.deleteExploreSarhBanner("e1");
    expect(apiClient.get).toHaveBeenCalledWith("/admin/explore-sarh-banners");
    expect(apiClient.post).toHaveBeenCalledWith("/admin/explore-sarh-banners", {
      imageUrl: "https://cdn.example/e.jpg",
      accessibilityLabel: "ملاحم",
      href: "/butchers",
    });
    expect(apiClient.patch).toHaveBeenCalledWith(
      "/admin/explore-sarh-banners/e1",
      {
        isActive: false,
      },
    );
    expect(apiClient.patch).toHaveBeenCalledWith(
      "/admin/explore-sarh-banners/reorder",
      {
        orderedIds: ["e1"],
      },
    );
    expect(apiClient.delete).toHaveBeenCalledWith(
      "/admin/explore-sarh-banners/e1",
    );
  });

  it("knowledge center", async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce(ok({ sources: [] }))
      .mockResolvedValueOnce(
        ok({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
      );
    (apiClient.post as jest.Mock).mockResolvedValueOnce(
      ok({
        user: { id: "kc", username: "knowledge_center", isAI: true },
        sources: { seeded: 3, total: 3 },
        follows: { users: 10, followsCreated: 10 },
        sourcesEnabled: 0,
        sync: { published: 2 },
      }),
    );
    await knowledge.fetchKnowledgeSources();
    await knowledge.syncKnowledge();
    await knowledge.fetchKnowledgeArticles({ status: "PENDING" });
    await knowledge.approveKnowledgeArticle("a1");
    await knowledge.activateKnowledgeCenter({ sync: true });
    expect(apiClient.get).toHaveBeenCalledWith("/admin/knowledge/sources");
    expect(apiClient.post).toHaveBeenCalledWith("/admin/knowledge/sync");
    expect(apiClient.post).toHaveBeenCalledWith("/admin/knowledge/activate", {
      sync: true,
    });
  });

  it("official services", async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce(ok({ services: [] }));
    await official.fetchOfficialServicesAdmin();
    await official.createOfficialService({
      title: "ت",
      description: "و",
      category: "veterinary",
      icon: "stethoscope",
      externalUrl: "https://example.com",
    });
    expect(apiClient.get).toHaveBeenCalledWith("/admin/services");
    expect(apiClient.post).toHaveBeenCalledWith(
      "/admin/services",
      expect.any(Object),
    );
  });

  it("ministry profile and posts", async () => {
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce(ok({ account: { id: "m1", username: "mewa" } }))
      .mockResolvedValueOnce(ok({ posts: [] }));
    await ministry.fetchMinistryProfile();
    await ministry.fetchMinistryPosts();
    await ministry.createMinistryPost({ content: "منشور الوزارة" });
    expect(apiClient.get).toHaveBeenCalledWith("/admin/ministry/profile");
    expect(apiClient.get).toHaveBeenCalledWith("/admin/ministry/posts");
    expect(apiClient.post).toHaveBeenCalledWith("/admin/ministry/posts", {
      content: "منشور الوزارة",
    });
  });
});
