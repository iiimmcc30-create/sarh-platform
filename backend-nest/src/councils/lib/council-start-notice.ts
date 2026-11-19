import { wantsCouncilStartedNotice } from '../../notifications/notification-prefs';

/** Restarting a council inside this window does not blast followers again. */
export const COUNCIL_START_OWNER_COOLDOWN_SEC = 10 * 60;

/** Hard cap so one live room cannot fan out without bound. */
export const COUNCIL_START_RECIPIENT_CAP = 5000;

export type CouncilStartAudienceInput = {
  councilId: string;
  councilName: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  golden: boolean;
  ownerId: string;
  ownerName: string;
  ownerAvatar?: string | null;
};

const SECRET_KEY = /code/i;

/** In-app + push payload. Private rooms deep-link to the code gate; the code is never included. */
export function councilStartPayload(
  input: CouncilStartAudienceInput,
): Record<string, string> {
  const data: Record<string, string> = {
    kind: 'council_live',
    councilId: input.councilId,
    visibility: input.visibility,
    locked: input.visibility === 'PRIVATE' ? '1' : '0',
    golden: input.golden ? '1' : '0',
    actorId: input.ownerId,
    actorName: input.ownerName,
    action: 'join',
  };
  if (input.ownerAvatar) data.actorAvatar = input.ownerAvatar;
  for (const key of Object.keys(data)) {
    if (SECRET_KEY.test(key)) {
      throw new Error(`council start payload must not carry ${key}`);
    }
  }
  return data;
}

export function councilStartCopy(ownerName: string, councilName: string) {
  const name = ownerName.trim() || 'مستخدم';
  const title = councilName.trim() || 'مجلس';
  return {
    titleAr: 'بدأ المجلس',
    bodyAr: `${name} بدأ المجلس «${title}»`,
  };
}

export function councilStartOptedOut(
  rows: Array<{ id: string; notificationPrefs: unknown }>,
  candidateIds: string[],
): Set<string> {
  const allowed = new Set(
    rows
      .filter((row) => wantsCouncilStartedNotice(row.notificationPrefs))
      .map((row) => row.id),
  );
  const out = new Set<string>();
  for (const id of candidateIds) {
    if (!allowed.has(id)) out.add(id);
  }
  return out;
}

/**
 * One recipient list: reminders (explicit «ذكّرني») always, followers only when
 * the owner is outside the restart window. The owner and opted-out users are dropped.
 * Reminders are kept first so the cap cannot drop someone who asked to be told.
 */
export function mergeCouncilStartRecipients(opts: {
  followerIds: string[];
  reminderIds: string[];
  ownerId: string;
  includeFollowers: boolean;
  optedOutIds: Set<string>;
  cap?: number;
}): string[] {
  const cap = opts.cap ?? COUNCIL_START_RECIPIENT_CAP;
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (
      !id ||
      id === opts.ownerId ||
      seen.has(id) ||
      opts.optedOutIds.has(id)
    ) {
      return;
    }
    if (out.length >= cap) return;
    seen.add(id);
    out.push(id);
  };
  for (const id of opts.reminderIds) push(id);
  if (opts.includeFollowers) {
    for (const id of opts.followerIds) push(id);
  }
  return out;
}
