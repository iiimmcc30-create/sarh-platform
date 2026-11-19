/**
 * X-style notification inbox: tabs, grouping, Arabic copy.
 * Pure module so tests can run without React Native.
 */
import { INTERACTION_REPOST_GREEN } from '@/lib/interactionActions';

export type InboxTab = 'all' | 'mentions';

export type InboxNotification = {
  id: string;
  type: string;
  titleAr: string;
  bodyAr: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
};

export type InboxVisualKind =
  | 'like'
  | 'repost'
  | 'follow'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'council'
  | 'review'
  | 'live'
  | 'message'
  | 'system';

export type InboxActor = {
  id: string | null;
  name: string;
  username: string | null;
  avatar: string | null;
};

export type InboxTextPart = { text: string; strong: boolean };

export type NotificationGroup = {
  id: string;
  ids: string[];
  type: string;
  kind: InboxVisualKind;
  actors: InboxActor[];
  peopleCount: number;
  parts: InboxTextPart[];
  createdAt: string;
  isRead: boolean;
  actionLabel: string | null;
  target: InboxNotification;
};

const GROUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export const INBOX_ICON: Record<InboxVisualKind, { name: string; color: string }> = {
  like: { name: 'heart', color: '#F91880' },
  repost: { name: 'repeat-2', color: INTERACTION_REPOST_GREEN },
  follow: { name: 'person-add-outline', color: '#1D9BF0' },
  comment: { name: 'chatbubble-outline', color: '#1D9BF0' },
  reply: { name: 'at-outline', color: '#1D9BF0' },
  mention: { name: 'at-outline', color: '#1D9BF0' },
  council: { name: 'mic-outline', color: '#7856FF' },
  review: { name: 'star', color: '#E0A100' },
  live: { name: 'videocam-outline', color: '#F91880' },
  message: { name: 'mail-outline', color: '#1D9BF0' },
  system: { name: 'notifications-outline', color: '#65727D' },
};

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function dataOf(n: InboxNotification): Record<string, unknown> {
  return n.data && typeof n.data === 'object' ? n.data : {};
}

export function arabicNumeral(n: number): string {
  return String(n).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)] ?? d);
}

function isReplyFlag(value: unknown): boolean {
  return value === '1' || value === 1 || value === true;
}

export function isDirectReply(n: InboxNotification): boolean {
  const data = dataOf(n);
  if (n.type === 'story_reply') return true;
  if (isReplyFlag(data.reply)) return true;
  return typeof data.parentId === 'string' && data.parentId.length > 0;
}

export function isMention(n: InboxNotification): boolean {
  const data = dataOf(n);
  if (n.type === 'mention') return true;
  if (isReplyFlag(data.mention)) return true;
  return str(data.kind) === 'mention';
}

/** «الإشارات»: @ mentions and direct replies only. Likes and council alerts stay in «الكل». */
export function isSignalNotification(n: InboxNotification): boolean {
  return isDirectReply(n) || isMention(n);
}

export function visualKind(n: InboxNotification): InboxVisualKind {
  const data = dataOf(n);
  const kind = str(data.kind);
  if (isMention(n)) return 'mention';
  if (n.type === 'like' || n.type === 'story_reaction') return 'like';
  if (n.type === 'repost') return 'repost';
  if (n.type === 'follow') return 'follow';
  if (isDirectReply(n)) return 'reply';
  if (n.type === 'comment') return 'comment';
  if (n.type === 'live_start') return 'live';
  if (n.type === 'new_message') return 'message';
  if (
    n.type === 'council_start' ||
    kind === 'council_live' ||
    kind === 'council_start'
  ) {
    return 'council';
  }
  if (n.type === 'review' || kind === 'review') return 'review';
  return 'system';
}

function actorFrom(n: InboxNotification): InboxActor {
  const data = dataOf(n);
  return {
    id: str(data.actorId),
    name: str(data.actorName) || str(data.actorUsername) || '',
    username: str(data.actorUsername),
    avatar: str(data.actorAvatar),
  };
}

function groupKey(n: InboxNotification, kind: InboxVisualKind): string | null {
  const data = dataOf(n);
  if (n.type === 'like' && kind === 'like') {
    const postId = str(data.postId);
    return postId ? `like:${postId}` : null;
  }
  if (n.type === 'story_reaction') {
    const storyId = str(data.storyId);
    return storyId ? `story:${storyId}` : null;
  }
  if (kind === 'repost') {
    const postId = str(data.postId);
    return postId ? `repost:${postId}` : null;
  }
  if (kind === 'follow') return 'follow';
  return null;
}

function peopleLead(actors: InboxActor[], peopleCount: number): string {
  const named = actors.filter((actor) => actor.name);
  const first = named[0]?.name || 'مستخدم';
  if (peopleCount <= 1) return first;
  if (peopleCount === 2 && named[1]) return `${first} و${named[1].name}`;
  const others = peopleCount - 1;
  if (others === 1) return `${first} وآخر`;
  return `${first} و${arabicNumeral(others)} آخرين`;
}

function actionPhrase(n: InboxNotification, kind: InboxVisualKind, people: number): string {
  const many = people >= 3;
  const pair = people === 2;
  if (n.type === 'story_reaction') {
    if (people <= 1) return 'تفاعل مع قصتك';
    return pair ? 'تفاعلا مع قصتك' : 'تفاعلوا مع قصتك';
  }
  switch (kind) {
    case 'like':
      if (people <= 1) return 'أعجب بمنشورك';
      return pair ? 'أعجبهما منشورك' : 'أعجبهم منشورك';
    case 'repost':
      if (people <= 1) return 'أعاد نشر منشورك';
      return pair ? 'أعادا نشر منشورك' : 'أعادوا نشر منشورك';
    case 'follow':
      if (people <= 1) return 'بدأ بمتابعتك';
      return pair ? 'بدآ بمتابعتك' : 'بدأوا بمتابعتك';
    case 'reply':
      return people <= 1 ? 'ردّ عليك' : many ? 'ردّوا عليك' : 'ردّا عليك';
    case 'mention':
      return people <= 1 ? 'أشار إليك' : 'أشاروا إليك';
    case 'comment':
      return people <= 1 ? 'علّق على منشورك' : 'علّقوا على منشورك';
    case 'review':
      return 'قيّم حسابك';
    case 'council':
      return '';
    default:
      return '';
  }
}

function partsFor(group: {
  kind: InboxVisualKind;
  actors: InboxActor[];
  peopleCount: number;
  target: InboxNotification;
}): InboxTextPart[] {
  const named = group.actors.some((actor) => actor.name);
  if (group.kind === 'council' || group.kind === 'message' || group.kind === 'live' || group.kind === 'system') {
    return [{ text: group.target.bodyAr || group.target.titleAr, strong: false }];
  }
  if (!named) {
    if (group.peopleCount > 1 && (group.kind === 'like' || group.kind === 'repost' || group.kind === 'follow')) {
      const verb = actionPhrase(group.target, group.kind, group.peopleCount);
      return [
        { text: `${arabicNumeral(group.peopleCount)} أشخاص`, strong: true },
        { text: ` ${verb}`, strong: false },
      ];
    }
    return [{ text: group.target.bodyAr || group.target.titleAr, strong: false }];
  }
  const lead = peopleLead(group.actors, group.peopleCount);
  const verb = actionPhrase(group.target, group.kind, group.peopleCount);
  if (!verb) return [{ text: group.target.bodyAr || lead, strong: false }];
  return [
    { text: lead, strong: true },
    { text: ` ${verb}`, strong: false },
  ];
}

type OpenGroup = NotificationGroup & { newestMs: number };

function seed(item: InboxNotification, kind: InboxVisualKind, at: number): OpenGroup {
  const actor = actorFrom(item);
  const actors = actor.id || actor.name ? [actor] : [];
  const group: OpenGroup = {
    id: item.id,
    ids: [item.id],
    type: item.type,
    kind,
    actors,
    peopleCount: 1,
    parts: [],
    createdAt: item.createdAt,
    isRead: item.isRead,
    actionLabel: kind === 'council' ? 'انضم' : null,
    target: item,
    newestMs: at,
  };
  group.parts = partsFor(group);
  return group;
}

/**
 * Groups likes, reposts, follows and story reactions on the same target
 * inside 24 hours. Everything else stays its own row. Input is newest-first.
 */
export function groupNotifications(
  items: InboxNotification[],
  nowMs: number = Date.now(),
): NotificationGroup[] {
  void nowMs;
  const groups: OpenGroup[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of items) {
    const kind = visualKind(item);
    const key = groupKey(item, kind);
    const at = Date.parse(item.createdAt);
    if (key) {
      const existingIndex = indexByKey.get(key);
      if (existingIndex !== undefined) {
        const current = groups[existingIndex];
        const within =
          Number.isFinite(at) &&
          Number.isFinite(current.newestMs) &&
          current.newestMs - at <= GROUP_WINDOW_MS &&
          current.newestMs - at >= 0;
        if (within) {
          current.ids.push(item.id);
          if (!item.isRead) current.isRead = false;
          const actor = actorFrom(item);
          const duplicate = actor.id
            ? current.actors.some((row) => row.id === actor.id)
            : false;
          if (!duplicate) {
            current.peopleCount += 1;
            if (actor.id || actor.name) current.actors.push(actor);
          }
          current.parts = partsFor(current);
          continue;
        }
      }
    }
    const next = seed(item, kind, Number.isFinite(at) ? at : 0);
    groups.push(next);
    if (key) indexByKey.set(key, groups.length - 1);
  }

  return groups.map(({ newestMs: _newest, ...group }) => group);
}
