// «المجالس» (Voice Councils) — API client, types and pure helpers.
// The backend is the source of truth for roles, seats, mutes, bans and Agora roles;
// nothing here grants permissions, it only mirrors what the server returned.
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import { SARH_OFFICIAL_SITE } from '@/constants/sarhOfficial';

export const COUNCIL_MAX_SPEAKERS = 12;
export const COUNCIL_GRID_COLUMNS = 4;
export const COUNCIL_NAME_MIN = 2;
export const COUNCIL_NAME_MAX = 60;
export const COUNCIL_DESCRIPTION_MAX = 300;
export const COUNCIL_RULES_MAX = 10;
export const COUNCIL_RULE_MAX = 200;
/** Socket heartbeat (server presence window is 75s). */
export const COUNCIL_HEARTBEAT_MS = 25_000;
/** Safety-net state refresh in case a realtime event was missed. */
export const COUNCIL_RESYNC_MS = 45_000;

export const COUNCIL_FULL_TEXT = 'اكتمل عدد المتحدثين في المجلس';
export const COUNCIL_ENDED_TEXT = 'انتهى المجلس';
export const COUNCIL_BANNED_TEXT = 'تم حظرك من هذا المجلس';
export const COUNCIL_KICKED_TEXT = 'تمت إزالتك من المجلس';
export const COUNCIL_WEB_TEXT = 'المجالس متاحة في تطبيق سرح على الجوال';
export const COUNCIL_AUDIO_UNAVAILABLE_TEXT = 'الصوت غير متاح حالياً، حاول لاحقاً';
export const COUNCIL_LIVE_BUSY_TEXT = 'أغلق البث المباشر أولاً للاستماع إلى المجلس';
export const COUNCILS_EMPTY_TEXT = 'لا توجد مجالس مباشرة الآن';
export const DEFAULT_COUNCIL_RULES = [
  'الاحترام واجب',
  'يمنع الإساءة',
  'يمنع رفع الصوت على الآخرين',
  'الالتزام بموضوع المجلس',
];

export type CouncilVisibility = 'PUBLIC' | 'PRIVATE';
export type CouncilStatus = 'LIVE' | 'ENDED';
export type CouncilMemberRole = 'OWNER' | 'MODERATOR' | 'SPEAKER' | 'LISTENER' | 'BANNED';

export type CouncilUser = {
  id: string;
  username: string;
  displayName: string;
  arabicName: string;
  avatar?: string | null;
  verified: boolean;
  verifiedTier?: string | null;
};

export type CouncilSpeaker = {
  userId: string;
  seatIndex: number;
  role: CouncilMemberRole;
  micMuted: boolean;
  mutedByModerator: boolean;
  online: boolean;
  agoraUid: number;
  user: CouncilUser;
};

export type CouncilPermissions = {
  isOwner: boolean;
  isModerator: boolean;
  canManageRequests: boolean;
  canMute: boolean;
  canRemove: boolean;
  canBan: boolean;
  canInvite: boolean;
  canManageModerators: boolean;
  canEdit: boolean;
  canEnd: boolean;
};

export type CouncilRequest = { id: string; createdAt: string; user: CouncilUser };

export type CouncilMeta = {
  id: string;
  name: string;
  description: string | null;
  rules: string[];
  visibility: CouncilVisibility;
  status: CouncilStatus;
  createdAt: string;
  startedAt: string;
  endedAt: string | null;
  owner: CouncilUser;
  maxSpeakers: number;
  moderatorPermissions: {
    canManageRequests: boolean;
    canMute: boolean;
    canRemove: boolean;
    canBan: boolean;
  };
  inviteCode?: string;
};

export type CouncilMe = {
  userId: string;
  role: CouncilMemberRole | null;
  joined: boolean;
  banned: boolean;
  kickedUntil: string | null;
  seatIndex: number | null;
  onStage: boolean;
  micMuted: boolean;
  mutedByModerator: boolean;
  rulesAccepted: boolean;
  pendingRequestId: string | null;
  rtcRole: 'publisher' | 'subscriber';
  permissions: CouncilPermissions;
};

export type CouncilState = {
  council: CouncilMeta;
  speakers: CouncilSpeaker[];
  speakersCount: number;
  listenerCount: number;
  isFull: boolean;
  me: CouncilMe;
  pendingRequests: CouncilRequest[];
};

export type CouncilAgoraCredentials = {
  appId: string;
  channel: string;
  token: string;
  uid: number;
  role: 'publisher' | 'subscriber';
  expiresIn: number;
  publishExpiresIn: number | null;
};

export type CouncilJoinResult = {
  state: CouncilState;
  agora: CouncilAgoraCredentials | null;
  agoraError: string | null;
};

export type CouncilTokenResult = CouncilAgoraCredentials & {
  seatIndex: number | null;
  micMuted: boolean;
  mutedByModerator: boolean;
  memberRole: CouncilMemberRole;
};

export type CouncilCard = {
  id: string;
  name: string;
  description: string | null;
  visibility: CouncilVisibility;
  status: CouncilStatus;
  startedAt: string;
  owner: CouncilUser;
  speakersPreview: CouncilUser[];
  speakersCount: number;
  listenerCount: number;
  isOwner: boolean;
};

export type CouncilInput = {
  name: string;
  description?: string;
  visibility: CouncilVisibility;
  rules: string[];
  modCanManageRequests?: boolean;
  modCanMute?: boolean;
  modCanRemove?: boolean;
  modCanBan?: boolean;
};

export type CouncilMemberAction =
  | 'promote'
  | 'demote'
  | 'mute'
  | 'unmute'
  | 'kick'
  | 'ban'
  | 'unban'
  | 'make_moderator'
  | 'remove_moderator';

/** API error with the backend's machine code (e.g. `council_full`, `rules_required`). */
export class CouncilApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CouncilApiError';
  }
}

const BASE = `${API_BASE}/api/councils`;
const NO_STORE: RequestInit = { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } };

async function request<T>(url: string, init: RequestInit = NO_STORE): Promise<T> {
  const res = await authFetch(url, init, 20_000);
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  if (!res.ok || !json?.success) {
    const message =
      (typeof json?.messageAr === 'string' && json.messageAr) ||
      (res.status === 404 ? 'المجلس غير موجود' : 'تعذّر إكمال الطلب، حاول مرة أخرى');
    const code = typeof json?.error === 'string' ? json.error : `http_${res.status}`;
    throw new CouncilApiError(message, res.status, code, json?.details);
  }
  return json.data as T;
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

const enc = encodeURIComponent;

export function fetchCouncils(cursor?: string | null) {
  const q = cursor ? `?cursor=${enc(cursor)}` : '';
  return request<{ councils: CouncilCard[]; nextCursor: string | null; hasMore: boolean }>(
    `${BASE}${q}`,
  );
}

export function fetchAccessibleCouncils() {
  return request<{ mine: CouncilCard | null; private: CouncilCard[] }>(`${BASE}/accessible`);
}

export function fetchCouncil(id: string, code?: string | null) {
  const q = code ? `?code=${enc(code)}` : '';
  return request<CouncilState>(`${BASE}/${enc(id)}${q}`);
}

export function createCouncil(input: CouncilInput) {
  return request<CouncilJoinResult>(BASE, jsonInit('POST', input));
}

export function updateCouncil(id: string, patch: Partial<CouncilInput>) {
  return request<CouncilState>(`${BASE}/${enc(id)}`, jsonInit('PATCH', patch));
}

export function joinCouncil(id: string, opts: { code?: string | null; acceptRules?: boolean } = {}) {
  return request<CouncilJoinResult>(
    `${BASE}/${enc(id)}/join`,
    jsonInit('POST', {
      ...(opts.code ? { code: opts.code } : {}),
      ...(opts.acceptRules ? { acceptRules: true } : {}),
    }),
  );
}

export function fetchCouncilToken(id: string) {
  return request<CouncilTokenResult>(`${BASE}/${enc(id)}/token`, jsonInit('POST'));
}

export function leaveCouncil(id: string) {
  return request<{ left: boolean }>(`${BASE}/${enc(id)}/leave`, jsonInit('POST'));
}

export function endCouncil(id: string) {
  return request<{ ended: boolean }>(`${BASE}/${enc(id)}/end`, jsonInit('POST'));
}

export function setCouncilMic(id: string, muted: boolean) {
  return request<{ micMuted: boolean }>(`${BASE}/${enc(id)}/mic`, jsonInit('POST', { muted }));
}

export function leaveCouncilStage(id: string) {
  return request<{ onStage: boolean }>(`${BASE}/${enc(id)}/stage/leave`, jsonInit('POST'));
}

export function requestToSpeak(id: string) {
  return request<{ requestId: string; status: string }>(`${BASE}/${enc(id)}/requests`, jsonInit('POST'));
}

export function cancelSpeakRequest(id: string) {
  return request<{ cancelled: boolean }>(`${BASE}/${enc(id)}/requests/mine`, jsonInit('DELETE'));
}

export function decideSpeakRequest(id: string, requestId: string, accept: boolean) {
  return request<{ requestId: string; status: string; seatIndex: number | null }>(
    `${BASE}/${enc(id)}/requests/${enc(requestId)}/${accept ? 'accept' : 'reject'}`,
    jsonInit('POST'),
  );
}

export function councilMemberAction(id: string, userId: string, action: CouncilMemberAction) {
  return request<{ action: CouncilMemberAction }>(
    `${BASE}/${enc(id)}/members/${enc(userId)}/actions`,
    jsonInit('POST', { action }),
  );
}

export function fetchCouncilBanned(id: string) {
  return request<{ banned: { bannedAt: string | null; user: CouncilUser }[] }>(
    `${BASE}/${enc(id)}/banned`,
  );
}

export function inviteToCouncil(id: string, userIds: string[]) {
  return request<{ invited: number }>(`${BASE}/${enc(id)}/invites`, jsonInit('POST', { userIds }));
}

export function rotateCouncilInvite(id: string) {
  return request<{ inviteCode: string }>(`${BASE}/${enc(id)}/invite-code/rotate`, jsonInit('POST'));
}

export function resolveCouncilInvite(code: string) {
  return request<{ councilId: string; code: string }>(`${BASE}/invite/${enc(code)}`);
}

export function searchCouncilUsers(q: string) {
  return request<{ users: CouncilUser[] }>(`${BASE}/users/search?q=${enc(q.trim())}`);
}

// ─── Pure helpers ──────────────────────────────────────────────────────────

export function councilUserName(user: Pick<CouncilUser, 'arabicName' | 'displayName' | 'username'>) {
  return user.arabicName || user.displayName || user.username;
}

export function formatCouncilCount(n: number): string {
  return Math.max(0, Math.floor(n || 0)).toLocaleString('en-US');
}

/**
 * "@username" for RTL screens. The leading LRM keeps the "@" before the Latin handle
 * on every platform (Android ignores `writingDirection`), so it never renders "user@".
 */
export function councilHandle(username: string): string {
  return `\u200E@${username}`;
}

export function councilListenersLabel(n: number): string {
  return `${formatCouncilCount(n)} مستمع`;
}

export function councilSpeakersLabel(n: number): string {
  return `${formatCouncilCount(n)} متحدث`;
}

export function councilInviteUrl(code: string): string {
  return `${SARH_OFFICIAL_SITE}/councils/join/${encodeURIComponent(code)}`;
}

export function isValidCouncilName(name: string): boolean {
  const t = name.trim();
  return t.length >= COUNCIL_NAME_MIN && t.length <= COUNCIL_NAME_MAX;
}

/** Trims rules, drops empty lines and enforces the backend limits. */
export function normalizeCouncilRules(rules: string[]): string[] {
  return rules
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => r.slice(0, COUNCIL_RULE_MAX))
    .slice(0, COUNCIL_RULES_MAX);
}

/** 12 fixed seats (4 × 3); empty seats stay as placeholders so the grid never jumps. */
export function councilSeatRows(speakers: CouncilSpeaker[]): (CouncilSpeaker | null)[][] {
  const seats: (CouncilSpeaker | null)[] = Array.from({ length: COUNCIL_MAX_SPEAKERS }, () => null);
  for (const s of speakers) {
    if (s.seatIndex >= 0 && s.seatIndex < COUNCIL_MAX_SPEAKERS) seats[s.seatIndex] = s;
  }
  const rows: (CouncilSpeaker | null)[][] = [];
  for (let i = 0; i < COUNCIL_MAX_SPEAKERS; i += COUNCIL_GRID_COLUMNS) {
    rows.push(seats.slice(i, i + COUNCIL_GRID_COLUMNS));
  }
  return rows;
}

export function councilRoleLabel(role: CouncilMemberRole | null | undefined): string {
  switch (role) {
    case 'OWNER':
      return 'راعي المجلس';
    case 'MODERATOR':
      return 'مشرف';
    case 'SPEAKER':
      return 'متحدث';
    case 'BANNED':
      return 'محظور';
    default:
      return 'مستمع';
  }
}

export type CouncilMenuItem = {
  key: CouncilMemberAction;
  label: string;
  icon: string;
  destructive?: boolean;
};

/**
 * Management sheet items for tapping `target` — mirrors the server permission matrix
 * (the server re-checks every action). Nobody manages the owner or themselves and
 * moderators never manage other moderators.
 */
export function councilMemberMenu(
  me: Pick<CouncilMe, 'userId' | 'permissions'>,
  target: Pick<CouncilSpeaker, 'userId' | 'role' | 'mutedByModerator'> & { onStage: boolean },
  isFull: boolean,
): CouncilMenuItem[] {
  const p = me.permissions;
  if (target.userId === me.userId || target.role === 'OWNER') return [];
  if (!p.isOwner && !(p.isModerator && target.role !== 'MODERATOR')) return [];
  const items: CouncilMenuItem[] = [];
  if (target.onStage) {
    if (p.canMute) {
      items.push(
        target.mutedByModerator
          ? { key: 'unmute', label: 'إلغاء الكتم', icon: 'mic' }
          : { key: 'mute', label: 'كتم', icon: 'mic-off' },
      );
    }
    if (p.canRemove) items.push({ key: 'demote', label: 'إزالة من المتحدثين', icon: 'volume-high' });
  } else if (p.canManageRequests && !isFull && target.role !== 'BANNED') {
    items.push({ key: 'promote', label: 'دعوة للتحدث', icon: 'mic' });
  }
  if (p.canManageModerators) {
    items.push(
      target.role === 'MODERATOR'
        ? { key: 'remove_moderator', label: 'إلغاء دور المشرف', icon: 'shield-outline' }
        : { key: 'make_moderator', label: 'جعله مشرفاً', icon: 'shield-checkmark-outline' },
    );
  }
  if (p.canRemove) items.push({ key: 'kick', label: 'إزالة من المجلس', icon: 'log-out-outline', destructive: true });
  if (p.canBan) items.push({ key: 'ban', label: 'حظر', icon: 'block', destructive: true });
  return items;
}

/** User-facing message for council error codes. */
export function councilErrorMessage(err: unknown): string {
  if (err instanceof CouncilApiError) {
    switch (err.code) {
      case 'council_full':
        return COUNCIL_FULL_TEXT;
      case 'council_ended':
        return COUNCIL_ENDED_TEXT;
      case 'council_banned':
        return COUNCIL_BANNED_TEXT;
      case 'council_kicked':
        return 'تمت إزالتك من المجلس مؤقتاً';
      case 'agora_unavailable':
        return COUNCIL_AUDIO_UNAVAILABLE_TEXT;
      default:
        return err.message;
    }
  }
  return err instanceof Error && err.message ? err.message : 'تعذّر إكمال الطلب، حاول مرة أخرى';
}
