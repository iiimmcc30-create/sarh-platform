import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';

export type MentionSuggestion = {
  id: string;
  username: string;
  displayName: string;
  arabicName: string;
  avatar: string | null;
  following: boolean;
};

export async function suggestMentions(query: string): Promise<MentionSuggestion[]> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  const qs = params.toString();
  const res = await authFetch(`${API_BASE}/api/users/mention-suggest${qs ? `?${qs}` : ''}`);
  if (!res.ok) return [];
  const json = (await res.json().catch(() => ({}))) as { data?: MentionSuggestion[] };
  return Array.isArray(json.data) ? json.data : [];
}
