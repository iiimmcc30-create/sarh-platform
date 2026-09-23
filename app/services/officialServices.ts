import { API_BASE } from '@/services/api';
import { authFetch, getAccessToken } from '@/services/authFetch';
import { fetchUserPosts } from '@/services/posts';
import { shouldReuseFreshResult } from '@/services/requestCoordination';
import type { Post } from '@/services/types';

export type OfficialService = {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  externalUrl: string;
  active: boolean;
  feeText?: string | null;
  isFree?: boolean;
  steps?: string | null;
  conditions?: string | null;
  documents?: string | null;
  deliveryChannel?: string | null;
  imageUrl?: string | null;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
};

export const OFFICIAL_SERVICE_CATEGORY_ORDER = [
  'veterinary',
  'livestock',
  'slaughter',
] as const;

export const OFFICIAL_SERVICE_CATEGORY_META: Record<
  string,
  { label: string; emoji: string }
> = {
  veterinary: { label: 'الخدمات البيطرية', emoji: '🏥' },
  livestock: { label: 'خدمات الماشية', emoji: '🐑' },
  slaughter: { label: 'خدمات المسالخ', emoji: '🔪' },
};

/** Embedded fallback when API is unavailable or not yet deployed */
export const FALLBACK_OFFICIAL_SERVICES: OfficialService[] = [
  {
    id: 'fallback-veterinary-registry',
    title: 'إصدار سجل مربي',
    description:
      'خدمة مقدمة من وزارة البيئة والمياه والزراعة تمكن هذه الخدمة المواطنين من ملاك الحيوانات لطلب إصدار سجل مربي.',
    category: 'veterinary',
    icon: 'document-text-outline',
    externalUrl:
      'https://anaam.mewa.gov.sa/anaam/ClinicRequestCardIssues/index?ClinicTypeId=fVfSs82hxvWEJfDm0UT+SA==',
    active: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'fallback-veterinary-clinic',
    title: 'طلب موعد زيارة عيادة بيطرية',
    description:
      'خدمة مقدمة من وزارة البيئة والمياه والزراعة تمكن هذه الخدمة المواطنين الحاصلين على سجل مربي من تقديم طلب موعد زيارة العيادة البيطرية التابعة لهم.',
    category: 'veterinary',
    icon: 'medical-outline',
    externalUrl:
      'https://naama.sa/services/details/443c9549-acdd-4a2a-a13a-2f878921c556',
    active: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'fallback-veterinary-vaccine',
    title: 'موعد التحصينات',
    description:
      'خدمة مقدمة من وزارة البيئة والمياه والزراعة تمكن هذه الخدمة المواطنين من ملاك الحيوانات من طلب موعد من العيادة التابعة لتحصين المواشي.',
    category: 'veterinary',
    icon: 'shield-checkmark-outline',
    externalUrl:
      'https://naama.sa/services/details/167e9681-249e-4101-b714-aeacecd22a06',
    active: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'fallback-livestock-numbering',
    title: 'طلب ترقيم الماشية',
    description:
      'خدمة مقدمة من وزارة البيئة والمياه والزراعة تسمح للمستفيدين بطلب ترقيم الماشية إلكترونياً.',
    category: 'livestock',
    icon: 'barcode-outline',
    externalUrl:
      'https://ui.naama.sa/livestocknumbering/livestock-numbering/enduser/livestock-numbering',
    active: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'fallback-livestock-data',
    title: 'إدارة بيانات الماشية',
    description:
      'خدمة إلكترونية مقدمة من وزارة البيئة والمياه والزراعة تمكن ملاك الماشية في المملكة من تحديث بيانات الماشية الخاصة بهم.',
    category: 'livestock',
    icon: 'list-outline',
    externalUrl:
      'https://ui.naama.sa/livestocknumbering/livestock-numbering/enduser/livestock-data-management',
    active: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'fallback-slaughter-booking',
    title: 'حجز موعد مسلخ',
    description:
      'خدمة مقدمة من وزارة البيئة والمياه والزراعة للحجز الإلكتروني للذبح في المسالخ، وتمكن المستفيدين أفراد أو أصحاب الملاحم من الحجز المسبق.',
    category: 'slaughter',
    icon: 'cut-outline',
    externalUrl: 'https://web.naama.sa/slaughter/appointment/termsconditions',
    active: true,
    createdAt: '',
    updatedAt: '',
  },
];

export type FetchOfficialServicesResult = {
  services: OfficialService[];
  fromApi: boolean;
};

export const HOME_MINISTRY_PREVIEW_LIMIT = 3;

/** Home preview — keep backend order, skip inactive rows, cap the count. */
export function previewOfficialServices(
  services: OfficialService[],
  limit = HOME_MINISTRY_PREVIEW_LIMIT,
): OfficialService[] {
  return services.filter((service) => service.active !== false).slice(0, limit);
}

export type MinistryAccount = {
  id: string;
  username: string;
  arabicName: string;
  displayName: string;
  bio?: string | null;
  about?: string | null;
  avatar?: string | null;
  coverImage?: string | null;
  website?: string | null;
  publicPhone?: string | null;
  publicEmail?: string | null;
  verified: boolean;
  allowPrivateMessages: boolean;
  followersCount: number;
  servicesCount: number;
  isFollowing: boolean;
};

export function formatServiceCountLabel(count: number): string {
  return `${count} خدمة`;
}

export function inferServiceDeliveryChannel(url?: string | null): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host.includes('naama.sa')) return 'تطبيق نما';
    if (host.includes('mewa.gov.sa') || host.includes('anaam.mewa')) {
      return 'منصة أنعام';
    }
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Same window as other profile/home focus skips — local to ministry fetches. */
export const MINISTRY_PROFILE_TTL_MS = 60_000;

type AccountCache = { at: number; data: MinistryAccount; auth: boolean };
type ServicesCache = { at: number; data: FetchOfficialServicesResult };
type PostsCache = { at: number; userId: string; data: Post[]; auth: boolean };

let accountCache: AccountCache | null = null;
let accountInflight: Promise<MinistryAccount | null> | null = null;
let servicesCache: ServicesCache | null = null;
let servicesInflight: Promise<FetchOfficialServicesResult> | null = null;
let postsCache: PostsCache | null = null;
let postsInflight: Promise<Post[]> | null = null;

function ministryAuthTag(): boolean {
  return Boolean(getAccessToken());
}

/** Test-only reset. */
export function resetMinistryProfileCache(): void {
  accountCache = null;
  accountInflight = null;
  servicesCache = null;
  servicesInflight = null;
  postsCache = null;
  postsInflight = null;
}

function mapMinistryAccount(account: Record<string, unknown>): MinistryAccount {
  return {
    id: String(account.id),
    username: String(account.username ?? 'mewa'),
    arabicName: String(account.arabicName ?? ''),
    displayName: String(account.displayName ?? ''),
    bio: account.bio ? String(account.bio) : null,
    about: account.about ? String(account.about) : null,
    avatar: account.avatar ? String(account.avatar) : null,
    coverImage: account.coverImage ? String(account.coverImage) : null,
    website: account.website ? String(account.website) : null,
    publicPhone: account.publicPhone ? String(account.publicPhone) : null,
    publicEmail: account.publicEmail ? String(account.publicEmail) : null,
    verified: Boolean(account.verified),
    allowPrivateMessages: account.allowPrivateMessages !== false,
    followersCount: Number(account.followersCount ?? 0),
    servicesCount: Number(account.servicesCount ?? 0),
    isFollowing: Boolean(account.isFollowing),
  };
}

export function fetchMinistryAccount(options?: {
  force?: boolean;
}): Promise<MinistryAccount | null> {
  const force = options?.force === true;
  const auth = ministryAuthTag();
  if (
    accountCache &&
    accountCache.auth === auth &&
    shouldReuseFreshResult(accountCache.at, MINISTRY_PROFILE_TTL_MS, force)
  ) {
    return Promise.resolve(accountCache.data);
  }
  if (accountInflight) return accountInflight;

  accountInflight = (async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/services/account`, {
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      });
      const json = await res.json().catch(() => ({}));
      const account = json?.data?.account;
      if (!res.ok || !json.success || !account?.id) {
        return accountCache?.auth === auth ? accountCache.data : null;
      }
      const mapped = mapMinistryAccount(account as Record<string, unknown>);
      accountCache = { at: Date.now(), data: mapped, auth };
      return mapped;
    } catch {
      return accountCache?.auth === auth ? accountCache.data : null;
    } finally {
      accountInflight = null;
    }
  })();

  return accountInflight;
}

export async function fetchOfficialService(id: string): Promise<OfficialService | null> {
  try {
    const res = await fetch(`${API_BASE}/api/services/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' },
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success && json.data?.service?.id) {
      return json.data.service as OfficialService;
    }
  } catch {
    // fall through
  }
  return null;
}

export function fetchOfficialServices(options?: {
  force?: boolean;
}): Promise<FetchOfficialServicesResult> {
  const force = options?.force === true;
  if (
    servicesCache &&
    shouldReuseFreshResult(servicesCache.at, MINISTRY_PROFILE_TTL_MS, force)
  ) {
    return Promise.resolve(servicesCache.data);
  }
  if (servicesInflight) return servicesInflight;

  servicesInflight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/services`, {
        headers: { Accept: 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && Array.isArray(json.data?.services)) {
        const data: FetchOfficialServicesResult = {
          services: json.data.services as OfficialService[],
          fromApi: true,
        };
        servicesCache = { at: Date.now(), data };
        return data;
      }
    } catch {
      // network error
    }
    if (servicesCache) return servicesCache.data;
    return { services: [], fromApi: false };
  })().finally(() => {
    servicesInflight = null;
  });

  return servicesInflight;
}

export function fetchMinistryPosts(
  userId: string,
  options?: { force?: boolean },
): Promise<Post[]> {
  const force = options?.force === true;
  const auth = ministryAuthTag();
  if (
    postsCache &&
    postsCache.userId === userId &&
    postsCache.auth === auth &&
    shouldReuseFreshResult(postsCache.at, MINISTRY_PROFILE_TTL_MS, force)
  ) {
    return Promise.resolve(postsCache.data);
  }
  if (postsInflight) return postsInflight;

  postsInflight = (async () => {
    try {
      const data = await fetchUserPosts(userId);
      postsCache = { at: Date.now(), userId, data, auth };
      return data;
    } catch (err) {
      if (postsCache && postsCache.userId === userId && postsCache.auth === auth) {
        return postsCache.data;
      }
      throw err;
    } finally {
      postsInflight = null;
    }
  })();

  return postsInflight;
}

export function splitServiceLines(value?: string | null): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function resolveServiceFeeLabel(service: OfficialService): string | null {
  const fee = service.feeText?.trim();
  if (fee) return fee;
  if (service.isFree !== false) return 'مجانا';
  return null;
}

export function resolveServiceChannel(service: OfficialService): string | null {
  const stored = service.deliveryChannel?.trim();
  if (stored) return stored;
  return inferServiceDeliveryChannel(service.externalUrl);
}

export function groupOfficialServicesByCategory(
  services: OfficialService[],
): Array<{ category: string; label: string; emoji: string; items: OfficialService[] }> {
  const buckets = new Map<string, OfficialService[]>();
  for (const service of services) {
    const list = buckets.get(service.category) ?? [];
    list.push(service);
    buckets.set(service.category, list);
  }

  const orderedKeys = [
    ...OFFICIAL_SERVICE_CATEGORY_ORDER.filter((key) => buckets.has(key)),
    ...[...buckets.keys()].filter(
      (key) =>
        !OFFICIAL_SERVICE_CATEGORY_ORDER.includes(
          key as typeof OFFICIAL_SERVICE_CATEGORY_ORDER[number],
        ),
    ),
  ];

  return orderedKeys.map((category) => {
    const meta = OFFICIAL_SERVICE_CATEGORY_META[category] ?? {
      label: category,
      emoji: '📋',
    };
    return {
      category,
      label: meta.label,
      emoji: meta.emoji,
      items: buckets.get(category) ?? [],
    };
  });
}
