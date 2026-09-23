import { API_BASE, ensureApiReachable } from '@/services/api';
import { fetchWithTimeout } from '@/services/fetchWithTimeout';
import {
  SARH_POLICIES,
  getPolicyBySlug,
  parsePolicyBody,
  policyBodyToMarkdown,
  type SarhPolicyDoc,
  type SarhPolicySlug,
} from '@/constants/sarhPolicies';

export type PublicPolicy = {
  slug: string;
  titleAr: string;
  bodyAr: string;
  updatedAt?: string;
  publishedAt?: string | null;
  isActive?: boolean;
  sortOrder?: number;
};

function fallbackList(): PublicPolicy[] {
  return SARH_POLICIES.map((p) => ({
    slug: p.slug,
    titleAr: p.titleAr,
    bodyAr: policyBodyToMarkdown(p),
    updatedAt: undefined,
    publishedAt: null,
    isActive: true,
    sortOrder: p.sortOrder,
  }));
}

export async function fetchPublicPolicies(): Promise<PublicPolicy[]> {
  try {
    await ensureApiReachable();
    const res = await fetchWithTimeout(`${API_BASE}/api/content/sections`);
    if (!res.ok) return fallbackList();
    const json = (await res.json()) as { data?: { sections?: PublicPolicy[] } };
    const sections = json?.data?.sections;
    if (!Array.isArray(sections) || sections.length === 0) return fallbackList();
    return sections
      .filter((s) => s.isActive !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  } catch {
    return fallbackList();
  }
}

export async function fetchPublicPolicy(slug: string): Promise<SarhPolicyDoc | null> {
  const local = getPolicyBySlug(slug);
  try {
    await ensureApiReachable();
    const res = await fetchWithTimeout(`${API_BASE}/api/content/sections/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      return local ?? null;
    }
    const json = (await res.json()) as { data?: { section?: PublicPolicy } };
    const section = json?.data?.section;
    if (!section?.bodyAr) return local ?? null;
    const sections = parsePolicyBody(section.bodyAr);
    return {
      slug: section.slug as SarhPolicySlug,
      titleAr: section.titleAr || local?.titleAr || slug,
      sortOrder: section.sortOrder ?? local?.sortOrder ?? 0,
      lastUpdatedLabel: section.publishedAt || section.updatedAt || local?.lastUpdatedLabel || '[تاريخ آخر تحديث]',
      sections: sections.length ? sections : local?.sections ?? [{ title: '', body: section.bodyAr }],
    };
  } catch {
    return local ?? null;
  }
}
